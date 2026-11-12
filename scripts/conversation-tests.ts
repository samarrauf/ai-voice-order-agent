// Phase 2 conversation tests: runs scripted callers through the real agent
// (via the dev-only /api/chat test rig) and saves full transcripts.
//
// Run (dev server must be running):
//   node --env-file=.env.local scripts/conversation-tests.ts
//
// SAFETY: the restaurant is set to "open all day" for the run so orders aren't
// refused as closed. The real hours are backed up to a file first and restored
// in `finally` — even if a conversation crashes or you press Ctrl+C.

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";

const RID = "11111111-1111-1111-1111-111111111111";
const CHAT_URL = "http://localhost:3000/api/chat";
const OUT_DIR = "test-results";

const CONVERSATIONS: { title: string; lines: string[]; phone?: string; postcode?: string }[] = [
  {
    title: "Full delivery order",
    lines: ["hi", "two 12 inch pepperoni please", "delivery to M14 5TP", "yes", "Sarah", "07700900123", "yes", "12 Oak Road", "cash", "yes"],
    phone: "07700900123",
    postcode: "M14 5TP",
  },
  {
    title: "Changes of mind, collection",
    lines: ["one margherita please", "10 inch", "actually make that two", "and add a garlic bread", "collection", "Tom", "07700900124", "yes"],
    phone: "07700900124",
  },
  { title: "Allergen question mid-order", lines: ["two pepperoni please", "12 inch", "does it have nuts?", "ok carry on"] },
  { title: "Postcode outside area", lines: ["hi", "delivery to SW1A 1AA"], postcode: "SW1A 1AA" },
  {
    title: "Below delivery minimum",
    lines: ["one 10 inch margherita", "delivery to M14 5TP", "yes", "Ann", "07700900125", "yes", "4 Elm Street", "cash", "yes"],
    phone: "07700900125",
    postcode: "M14 5TP",
  },
  { title: "What do you have?", lines: ["what do you have?"] },
  { title: "Item not on menu", lines: ["do you have sushi?"] },
  { title: "Are you a real person?", lines: ["am I talking to a real person?", "ok, two pepperoni then", "12 inch"] },
];

type ToolCall = { name: string; input: Record<string, unknown>; status: number; result: Record<string, unknown>; ms: number };
type Turn = { caller: string; reply: string; toolCalls: ToolCall[]; words: number; ms: number; costUsd: number };

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ALL_DAY = Object.fromEntries(
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [{ open: "00:00", close: "00:00" }]]),
);

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const pcNorm = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function runConversation(lines: string[]): Promise<Turn[]> {
  let messages: unknown[] = [];
  const turns: Turn[] = [];
  for (const caller of lines) {
    messages.push({ role: "user", content: caller });
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`chat failed: ${json.error ?? res.status}`);
    messages = json.messages;
    turns.push({
      caller,
      reply: json.reply,
      toolCalls: json.toolCalls,
      words: words(json.reply),
      ms: json.usage.ms,
      costUsd: json.usage.costUsd,
    });
    process.stdout.write(".");
  }
  return turns;
}

async function main() {
  // Server reachable?
  await fetch(CHAT_URL, { method: "POST", body: "{}" }).catch(() => {
    throw new Error("Dev server not running on localhost:3000 — start it with npm run dev");
  });

  // 1) Back up the real hours BEFORE touching anything.
  const { data: before, error: readErr } = await db.from("restaurants").select("opening_hours").eq("id", RID).single();
  if (readErr || !before) throw new Error(`could not read opening hours: ${readErr?.message}`);
  mkdirSync(OUT_DIR, { recursive: true });
  const backupPath = `${OUT_DIR}/opening-hours-backup.json`;
  writeFileSync(backupPath, JSON.stringify(before.opening_hours, null, 2));
  console.log(`Real opening hours backed up to ${backupPath}`);

  let restored = false;
  const restore = async () => {
    if (restored) return;
    const { error } = await db.from("restaurants").update({ opening_hours: before.opening_hours }).eq("id", RID);
    if (error) {
      console.error(`!!! FAILED TO RESTORE OPENING HOURS — restore manually from ${backupPath}`, error);
      return;
    }
    const { data: check } = await db.from("restaurants").select("opening_hours").eq("id", RID).single();
    const same = JSON.stringify(check?.opening_hours) === JSON.stringify(before.opening_hours);
    restored = same;
    console.log(same ? "Real opening hours restored and verified." : `!!! Hours restore could not be verified — check ${backupPath}`);
  };
  process.on("SIGINT", async () => {
    await restore();
    process.exit(130);
  });

  const results: { n: number; title: string; turns: Turn[]; error?: string }[] = [];
  try {
    // 2) Open all day for the run.
    const { error: openErr } = await db.from("restaurants").update({ opening_hours: ALL_DAY }).eq("id", RID);
    if (openErr) throw new Error(`could not set test hours: ${openErr.message}`);

    for (const [i, c] of CONVERSATIONS.entries()) {
      process.stdout.write(`Test ${i + 1} (${c.title}) `);
      try {
        results.push({ n: i + 1, title: c.title, turns: await runConversation(c.lines) });
      } catch (e) {
        results.push({ n: i + 1, title: c.title, turns: [], error: String(e) });
      }
      process.stdout.write("\n");
    }
  } finally {
    await restore();
  }

  // 3) Mechanical checks.
  const created = { orders: [] as { test: number; order_number: string }[], callbacks: [] as { test: number; id: string }[] };
  const checks: string[] = [];
  for (const r of results) {
    const script = CONVERSATIONS[r.n - 1];
    r.turns.forEach((t, ti) => {
      if (t.words > 25) checks.push(`D | test ${r.n} turn ${ti + 1}: ${t.words} words`);
      for (const c of t.toolCalls) {
        if (c.name === "create_order" && c.input.preview === false && c.result.order_number) {
          created.orders.push({ test: r.n, order_number: String(c.result.order_number) });
          const previewTurn = r.turns.findIndex((pt) => pt.toolCalls.some((pc) => pc.name === "create_order" && pc.input.preview === true));
          checks.push(
            `A | test ${r.n}: placed at turn ${ti + 1} after caller said "${t.caller}"; first preview at turn ${previewTurn + 1}` +
              (previewTurn >= 0 && previewTurn < ti ? " (preview in an EARLIER turn: OK)" : " (NO earlier preview: FAIL)"),
          );
        }
        if (c.name === "request_callback" && c.result.callback_id) {
          created.callbacks.push({ test: r.n, id: String(c.result.callback_id) });
        }
        if (script.phone && "customer_phone" in c.input) {
          const ok = digits(c.input.customer_phone) === digits(script.phone);
          checks.push(`B | test ${r.n} ${c.name}: phone sent ${c.input.customer_phone} vs said ${script.phone}: ${ok ? "MATCH" : "MISMATCH"}`);
        }
        const pc = c.input.postcode ?? c.input.delivery_postcode;
        if (script.postcode && pc) {
          const ok = pcNorm(pc) === pcNorm(script.postcode);
          checks.push(`B | test ${r.n} ${c.name}: postcode sent ${pc} vs said ${script.postcode}: ${ok ? "MATCH" : "MISMATCH"}`);
        }
      }
    });
  }

  // 4) Write transcripts.
  const totalCost = results.flatMap((r) => r.turns).reduce((s, t) => s + t.costUsd, 0);
  let md = `# Phase 2 conversation tests\n\nRun: ${new Date().toISOString()} · model claude-haiku-5-5 · total cost $${totalCost.toFixed(4)}\n\n`;
  md += `## Automatic checks\n\n${checks.map((c) => `- ${c}`).join("\n") || "- none"}\n\n`;
  for (const r of results) {
    md += `## Test ${r.n}: ${r.title}\n\n`;
    if (r.error) md += `**ERROR:** ${r.error}\n\n`;
    r.turns.forEach((t, ti) => {
      md += `**${ti + 1}. Caller:** ${t.caller}\n\n`;
      for (const c of t.toolCalls) {
        md += `> 🔧 \`${c.name}\` ${JSON.stringify(c.input)} → ${c.status}${c.result.speech ? ` — "${c.result.speech}"` : ""}\n>\n`;
      }
      md += `**Gio** _(${t.words} words, ${t.ms}ms)_: ${t.reply}\n\n`;
    });
  }
  writeFileSync(`${OUT_DIR}/phase2-conversations.md`, md);
  writeFileSync(`${OUT_DIR}/phase2-created-rows.json`, JSON.stringify(created, null, 2));
  console.log(`\nTranscripts: ${OUT_DIR}/phase2-conversations.md · total cost $${totalCost.toFixed(4)}`);
  console.log(JSON.stringify(created));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
