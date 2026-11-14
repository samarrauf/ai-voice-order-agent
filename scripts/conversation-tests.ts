// Phase 2 conversation tests: runs simulated callers through the real agent
// (via the dev-only /api/chat test rig), checks Gio's behaviour automatically,
// saves full transcripts, then deletes every order and callback it created.
//
// Run (dev server must be running):
//   node --env-file=.env.local scripts/conversation-tests.ts
//
// THE CALLERS REACT. Each test starts with a few fixed lines, then the caller
// answers whatever Gio actually asked (postcode, name, "Is that all correct?"…),
// so a test doesn't fall out of step just because Gio asked things in a
// different order. Scenario rules override the default answers (the stubborn
// caller, the caller who says "no, THREE pepperoni", …).
//
// SAFETY: the restaurant is set to "open all day" for the run so orders aren't
// refused as closed. The real hours are backed up to a file first and restored
// in `finally` — even if a conversation crashes or you press Ctrl+C.

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";

const RID = "11111111-1111-1111-1111-111111111111";
const CHAT_URL = "http://localhost:3000/api/chat";
const OUT_DIR = "test-results";
// Orders that must never be deleted by the cleanup step.
const KEEP_ORDERS = new Set(["A-1001", "A-1002", "A-1025"]);

// ---------------------------------------------------------------- callers

type Persona = {
  fulfilment: "delivery" | "collection";
  postcode?: string;
  name: string;
  phone: string;
  address?: string;
  payment: string;
};

type Rule = {
  /** Tested against Gio's last question (default) or his whole reply ("full"). */
  when: RegExp;
  scope?: "question" | "full";
  /** Said in order, one per match. The rule switches off when they run out. */
  say: string[];
  onFire?: (p: Persona) => void;
};

type Convo = {
  title: string;
  /** Sent in order regardless of what Gio says. */
  opening: string[];
  /** Runs once before the conversation, e.g. to fill a table. */
  setup?: () => Promise<void>;
  /** If absent, the caller stops after the opening lines. */
  persona?: Persona;
  rules?: Rule[];
  maxTurns?: number;
  phones?: string[];
  postcode?: string;
  check?: (r: Result) => Check[];
};

type ToolCall = { name: string; input: Record<string, unknown>; status: number; result: Record<string, unknown>; ms: number };
type Turn = { caller: string; reply: string; toolCalls: ToolCall[]; words: number; ms: number; costUsd: number };
type Result = { n: number; convo: Convo; turns: Turn[]; error?: string };
type Check = { rule: string; pass: boolean; detail: string };

const YES = /^(yes|yeah|yep|yup|correct|that's right|that's correct|perfect|spot on)\b/i;

// Days used by the table-booking scenarios: far enough ahead to be free, one
// per scenario. `spoken` is what the caller says, `iso` what the tool must receive.
function testDay(daysAhead: number): { iso: string; spoken: string } {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  const weekday = d.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  const month = d.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  return { iso: d.toISOString().slice(0, 10), spoken: `${weekday} the ${d.getUTCDate()} of ${month}` };
}
const DAY_A = testDay(30);
const DAY_B = testDay(31);
const DAY_C = testDay(32);
const DAY_D = testDay(33);

// Bookings made outside the conversations (to fill a table); removed in cleanup().
const seededBookings: string[] = [];
async function seedBooking(date: string, time: string, party: number): Promise<void> {
  const { data, error } = await db.rpc("create_booking_tx", {
    p_restaurant_id: RID,
    p_date: date,
    p_time: time,
    p_party_size: party,
    p_customer_name: "Conversation Test",
    p_customer_phone: "07700900000",
    p_menu_preferences: "conversation-test seed",
  });
  const result = data as { success?: boolean; booking_reference?: string } | null;
  if (error || !result?.success || !result.booking_reference) {
    throw new Error(`could not seed booking: ${error?.message ?? JSON.stringify(result)}`);
  }
  seededBookings.push(result.booking_reference);
}

const CONVERSATIONS: Convo[] = [
  {
    title: "Full delivery order",
    opening: ["hi", "two 12 inch pepperoni please"],
    persona: { fulfilment: "delivery", postcode: "M14 5TP", name: "Sarah", phone: "07700900123", address: "12 Oak Road", payment: "cash" },
    phones: ["07700900123"],
    postcode: "M14 5TP",
    check: (r) => [expectPlaced(r, 1)],
  },
  {
    title: "Changes of mind, collection",
    opening: ["one margherita please", "10 inch", "actually make that two", "and add a garlic bread"],
    rules: [{ when: /plain|chees/i, scope: "full", say: ["plain please"] }],
    persona: { fulfilment: "collection", name: "Tom", phone: "07700900124", payment: "card" },
    phones: ["07700900124"],
    check: (r) => {
      const placed = placedOrders(r);
      const names = itemNames(r);
      const items = placed[0]?.input.items as Item[] | undefined;
      const marg = items?.find((i) => /margherita/i.test(names.get(i.menu_item_id) ?? ""));
      const garlic = items?.find((i) => /garlic/i.test(names.get(i.menu_item_id) ?? ""));
      return [
        expectPlaced(r, 1),
        {
          rule: "changes kept",
          pass: !!marg && marg.quantity === 2 && !!garlic,
          detail: items ? `placed ${describeItems(items, names)}` : "no order placed",
        },
      ];
    },
  },
  {
    title: "Allergen question mid-order",
    opening: ["two pepperoni please", "12 inch", "does it have nuts?", "ok carry on"],
    persona: { fulfilment: "collection", name: "Raj", phone: "07700900126", payment: "cash" },
    phones: ["07700900126"],
    check: (r) => {
      const t = r.turns[3];
      const pushes = t ? /call (you )?back|ring you|your (name|number)|allergen|nuts/i.test(t.reply) : true;
      const restarted = t ? /what can I get you/i.test(t.reply) : true;
      const placed = placedOrders(r)[0]?.input.items as Item[] | undefined;
      const kept = !!placed && placed.length === 1 && placed[0].quantity === 2 && placed[0].size_name === "12 inch";
      return [
        {
          rule: "6 resume after interruption",
          pass: !!t && !pushes && !restarted && !t.toolCalls.some((c) => c.name === "request_callback"),
          detail: t ? `after "ok carry on": "${t.reply}"` : "no turn 4",
        },
        { rule: "running order kept", pass: kept, detail: placed ? `placed ${JSON.stringify(placed)}` : "no order placed" },
      ];
    },
  },
  {
    title: "Postcode outside area",
    opening: ["hi", "delivery to SW1A 1AA"],
    rules: [{ when: /don't deliver|collection|collect/i, scope: "full", say: ["no thanks then, bye"] }],
    persona: { fulfilment: "delivery", postcode: "SW1A 1AA", name: "Kate", phone: "07700900129", payment: "cash" },
    postcode: "SW1A 1AA",
    maxTurns: 6,
    check: (r) => {
      const calls = r.turns.flatMap((t) => t.toolCalls).filter((c) => c.name === "check_delivery");
      return [{ rule: "refused delivery", pass: calls.some((c) => c.result.deliverable === false), detail: `${calls.length} check_delivery call(s)` }];
    },
  },
  {
    title: "Below delivery minimum",
    opening: ["one 10 inch margherita", "delivery to M14 5TP"],
    rules: [
      {
        when: /minimum/i,
        scope: "full",
        say: ["I'll just collect it then"],
        onFire: (p) => {
          p.fulfilment = "collection";
        },
      },
    ],
    persona: { fulfilment: "delivery", postcode: "M14 5TP", name: "Ann", phone: "07700900125", address: "4 Elm Street", payment: "cash" },
    phones: ["07700900125"],
    postcode: "M14 5TP",
    check: (r) => {
      const placed = placedOrders(r);
      return [
        {
          rule: "switched to collection",
          pass: placed.length === 1 && placed[0].input.fulfilment_type === "pickup",
          detail: placed.length ? `placed as ${placed[0].input.fulfilment_type}` : "no order placed",
        },
      ];
    },
  },
  { title: "What do you have?", opening: ["what do you have?"] },
  { title: "Item not on menu", opening: ["do you have sushi?"] },
  { title: "Are you a real person?", opening: ["am I talking to a real person?", "ok, two pepperoni then", "12 inch"] },
  {
    title: "Stubborn caller",
    opening: ["one garlic bread"],
    rules: [{ when: /plain|chees|which (one|kind)|what kind/i, say: ["umm", "dunno", "whatever", "you choose"] }],
    persona: { fulfilment: "collection", name: "Lee", phone: "07700900127", payment: "cash" },
    phones: ["07700900127"],
    check: (r) => {
      const asked = r.turns.filter((t) => /plain|chees|which (one|kind)|what kind/i.test(lastQuestion(t.reply))).length;
      const names = itemNames(r);
      const resolved =
        r.turns.some((t) =>
          t.toolCalls.some(
            (c) => c.name === "create_order" && (c.input.items as Item[] | undefined)?.some((i) => /garlic/i.test(names.get(i.menu_item_id) ?? "")),
          ),
        ) || r.turns.some((t) => t.toolCalls.some((c) => c.name === "request_callback"));
      return [
        { rule: "5 garlic bread question ≤ 2 times", pass: asked <= 2, detail: `asked ${asked} time(s)` },
        { rule: "5 picked a default or offered callback", pass: resolved, detail: resolved ? "moved on" : "stuck" },
      ];
    },
  },
  {
    title: "Confirmation refused",
    opening: ["two 12 inch pepperoni please"],
    rules: [{ when: /all correct/i, say: ["no, I said THREE pepperoni"] }],
    persona: { fulfilment: "collection", name: "Priya", phone: "07700900128", payment: "cash" },
    phones: ["07700900128"],
    check: (r) => {
      const refusedAt = r.turns.findIndex((t) => /THREE pepperoni/.test(t.caller));
      const placed = placedOrders(r);
      const qty = (c: ToolCall) => ((c.input.items as Item[] | undefined) ?? []).reduce((s, i) => s + i.quantity, 0);
      const previewsAfter = r.turns.slice(refusedAt).flatMap((t) => t.toolCalls).filter((c) => c.name === "create_order" && c.input.preview === true);
      const readBackAgain = r.turns.slice(refusedAt).some((t) => /all correct/i.test(t.reply));
      return [
        {
          rule: "10 original (2) not placed",
          pass: refusedAt >= 0 && !placed.some((c) => qty(c) === 2),
          detail: refusedAt < 0 ? "never reached 'Is that all correct?'" : `placed quantities: [${placed.map(qty).join(", ")}]`,
        },
        { rule: "10 previewed again with 3", pass: previewsAfter.some((c) => qty(c) === 3), detail: `${previewsAfter.length} preview(s) after the correction` },
        { rule: "10 read back again", pass: readBackAgain, detail: readBackAgain ? "asked 'Is that all correct?' again" : "no second read-back" },
        { rule: "10 corrected order placed once", pass: placed.length === 1 && qty(placed[0]) === 3, detail: `${placed.length} order(s) placed` },
      ];
    },
  },
  {
    title: "Correction after placing",
    opening: ["two 12 inch pepperoni please"],
    rules: [
      {
        when: /got your number as/i,
        scope: "full",
        say: ["that's the wrong number, it's 07700900999"],
        onFire: (p) => {
          p.phone = "07700900999";
        },
      },
    ],
    persona: { fulfilment: "collection", name: "Dan", phone: "07700900123", payment: "cash" },
    phones: ["07700900123", "07700900999"],
    check: (r) => {
      const placed = placedOrders(r);
      const callbacks = r.turns.flatMap((t) => t.toolCalls).filter((c) => c.name === "request_callback" && c.status === 200);
      const fixed = callbacks.some((c) => digits(c.input.customer_phone) === "07700900999");
      return [
        { rule: "11 no second order", pass: placed.length === 1, detail: `${placed.length} order(s) placed` },
        {
          rule: "11 callback with corrected number",
          pass: fixed,
          detail: callbacks.length ? callbacks.map((c) => `${c.input.customer_phone} (${c.input.reason}): ${c.input.details ?? ""}`).join("; ") : "no callback saved",
        },
      ];
    },
  },

  // ------------------------------------------------------------ table bookings
  // Each booking scenario uses its own day so they never collide with each
  // other. Bookings are made for real (and deleted at the end), and the
  // restaurant is open all day during the run, so the time of day never matters.
  {
    title: "Table booking: straight through",
    opening: ["hi, I'd like to book a table please"],
    rules: [
      { when: /date|day/i, say: [DAY_A.spoken] },
      { when: /time/i, say: ["half past seven in the evening"] },
      { when: /how many|people|party/i, say: ["four"] },
    ],
    persona: { fulfilment: "collection", name: "Sam", phone: "07700900123", payment: "cash" },
    phones: ["07700900123"],
    check: (r) => {
      const calls = r.turns.flatMap((t) => t.toolCalls);
      const made = calls.filter((c) => c.name === "create_booking");
      const ok = made.filter((c) => c.status === 200);
      const at = r.turns.findIndex((t) => t.toolCalls.some((c) => c.name === "create_booking"));
      const firstCheck = r.turns.findIndex((t) => t.toolCalls.some((c) => c.name === "check_availability"));
      const input = ok[0]?.input;
      return [
        { rule: "A booking made once", pass: made.length === 1 && ok.length === 1, detail: `${made.length} create_booking call(s), ${ok.length} succeeded` },
        { rule: "A checked availability first", pass: firstCheck >= 0 && firstCheck < at, detail: `check at turn ${firstCheck + 1}, booking at turn ${at + 1}` },
        {
          rule: "A booking details right",
          pass: !!input && input.date === DAY_A.iso && input.time === "19:30" && input.party_size === 4 && digits(input.customer_phone) === "07700900123",
          detail: input ? JSON.stringify(input) : "no booking",
        },
        {
          rule: "A waited for yes to the read-back",
          pass: at > 0 && /all correct|shall I confirm/i.test(r.turns[at - 1].reply) && YES.test(r.turns[at].caller.trim()),
          detail: at > 0 ? `asked: "${r.turns[at - 1].reply}" / caller: "${r.turns[at].caller}"` : "no booking",
        },
        {
          rule: "A reference and table given",
          pass: at >= 0 && /reference/i.test(r.turns[at].reply) && /table/i.test(r.turns[at].reply),
          detail: at >= 0 ? `"${r.turns[at].reply}"` : "no booking",
        },
      ];
    },
  },
  {
    title: "Table booking: no space, offers another time",
    // The only eight-seater is already booked at 19:00 that day.
    setup: () => seedBooking(DAY_B.iso, "19:00", 8),
    opening: ["hi, I'd like to book a table please"],
    rules: [
      { when: /date|day/i, say: [DAY_B.spoken] },
      { when: /time/i, say: ["seven o'clock in the evening"] },
      { when: /how many|people|party/i, say: ["eight"] },
      { when: /another|different|other|instead|try/i, say: ["how about nine o'clock"] },
    ],
    persona: { fulfilment: "collection", name: "Priya", phone: "07700900124", payment: "cash" },
    phones: ["07700900124"],
    check: (r) => {
      const calls = r.turns.flatMap((t) => t.toolCalls);
      const checks = calls.filter((c) => c.name === "check_availability");
      const failedAt = r.turns.findIndex((t) => t.toolCalls.some((c) => c.name === "check_availability" && c.result.available === false));
      const offered = failedAt >= 0 && r.turns.slice(failedAt, failedAt + 3).some((t) => /another|different|other|how about/i.test(t.reply));
      const made = calls.filter((c) => c.name === "create_booking");
      const ok = made.filter((c) => c.status === 200);
      return [
        { rule: "B first check found no table", pass: checks[0]?.result.available === false, detail: `first check: ${JSON.stringify(checks[0]?.result.available)}` },
        { rule: "B asked about another day or time", pass: offered, detail: failedAt >= 0 ? `replies after the failed check: ${r.turns.slice(failedAt, failedAt + 3).map((t) => `"${t.reply}"`).join(" / ")}` : "no failed check" },
        { rule: "B did not book the full slot", pass: !made.some((c) => c.input.time === "19:00"), detail: `${made.length} create_booking call(s)` },
        { rule: "B at most two failed checks", pass: checks.filter((c) => c.result.available === false).length <= 2, detail: `${checks.length} check(s)` },
        {
          rule: "B booked the other time",
          pass: ok.length === 1 && ok[0].input.time === "21:00" && ok[0].input.date === DAY_B.iso,
          detail: ok.length ? JSON.stringify(ok[0].input) : "no booking made",
        },
      ];
    },
  },
  {
    title: "Table booking: party of twelve",
    opening: ["hi, I'd like to book a table for twelve people", `${DAY_C.spoken} at seven then`],
    check: (r) => {
      const calls = r.turns.flatMap((t) => t.toolCalls);
      const replies = r.turns.map((t) => t.reply).join(" ");
      return [
        { rule: "C no booking tools called", pass: !calls.some((c) => c.name === "check_availability" || c.name === "create_booking"), detail: `${calls.length} tool call(s): ${calls.map((c) => c.name).join(", ") || "none"}` },
        { rule: "C advised ringing the shop", pass: /\b(ring|call|phone)\b/i.test(replies) && /shop|restaurant/i.test(replies), detail: `"${replies}"` },
        { rule: "C no workaround", pass: !/two tables|join|push (the )?tables|split/i.test(replies), detail: "no table-joining offered" },
      ];
    },
  },
  {
    title: "Table booking: wrong digit caught by read-back",
    // The caller says the number was read back wrongly, then gives the right one.
    opening: ["hi, I'd like to book a table please"],
    rules: [
      { when: /date|day/i, say: [DAY_D.spoken] },
      { when: /time/i, say: ["eight o'clock in the evening"] },
      { when: /how many|people|party/i, say: ["two"] },
      {
        when: /\b(oh|zero)[-\s,]+seven/i,
        scope: "full",
        say: ["no, that's wrong, it's 07700900999"],
        onFire: (p) => {
          p.phone = "07700900999";
        },
      },
    ],
    persona: { fulfilment: "collection", name: "Dan", phone: "07700900123", payment: "cash" },
    phones: ["07700900123", "07700900999"],
    check: (r) => {
      const calls = r.turns.flatMap((t) => t.toolCalls);
      const made = calls.filter((c) => c.name === "create_booking");
      const ok = made.filter((c) => c.status === 200);
      const at = r.turns.findIndex((t) => t.toolCalls.some((c) => c.name === "create_booking"));
      const gate = at > 0 ? spokenReadBack(r.turns[at - 1].reply) : null;
      return [
        { rule: "D corrected number stored", pass: ok.length === 1 && digits(ok[0].input.customer_phone) === "07700900999", detail: ok.length ? `stored ${ok[0].input.customer_phone}` : "no booking made" },
        { rule: "D wrong number never booked", pass: !made.some((c) => digits(c.input.customer_phone) === "07700900123"), detail: `${made.length} create_booking call(s)` },
        { rule: "D final read-back had the corrected number", pass: gate?.text === "07700900999", detail: gate ? `read back ${gate.text}` : "no read-back found before booking" },
        { rule: "D server echo matches", pass: ok.length === 1 && digits(ok[0].result.stored_phone) === "07700900999", detail: ok.length ? `stored_phone ${ok[0].result.stored_phone}` : "no booking made" },
      ];
    },
  },
];

// ---------------------------------------------------------------- helpers

type Item = { menu_item_id: string; quantity: number; size_name?: string };

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const pcNorm = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** The last sentence ending in "?", or the whole reply if there is none. */
function lastQuestion(reply: string): string {
  // Split on sentence ends followed by a space, so "4.99?" stays in one piece.
  const qs = reply.split(/(?<=[.!?])\s+/).filter((s) => s.trim().endsWith("?"));
  return qs.length ? qs[qs.length - 1].trim() : reply;
}

function placedOrders(r: Result): ToolCall[] {
  return r.turns.flatMap((t) => t.toolCalls).filter((c) => c.name === "create_order" && c.input.preview === false && c.result.order_number);
}

function itemNames(r: Result): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of r.turns.flatMap((t) => t.toolCalls)) {
    if (c.name !== "search_menu") continue;
    for (const x of (c.result.matches as { id: string; name: string }[] | undefined) ?? []) m.set(x.id, x.name);
  }
  return m;
}

function describeItems(items: Item[], names: Map<string, string>): string {
  return items.map((i) => `${i.quantity}x ${i.size_name ? i.size_name + " " : ""}${names.get(i.menu_item_id) ?? i.menu_item_id}`).join(", ");
}

function expectPlaced(r: Result, n: number): Check {
  const placed = placedOrders(r);
  return { rule: "order completed", pass: placed.length === n, detail: `${placed.length} order(s) placed` };
}

const DIGIT: Record<string, string> = {
  oh: "0", zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};

/**
 * Finds a spoken phone number or postcode in a reply and turns it back into
 * characters: "oh-seven-seven, double-oh" -> "07700", "M-one-four, five-T-P" -> "M145TP".
 * Only hyphenated groups count, so normal sentences don't trigger it.
 */
function spokenReadBack(reply: string): { text: string; span: string } | null {
  const m = reply.match(/(?:[A-Za-z]+(?:-[A-Za-z]+)+|\b(?:oh|zero|one|two|three|four|five|six|seven|eight|nine|double|triple|[A-Z])\b)(?:[\s,]+(?:[A-Za-z]+(?:-[A-Za-z]+)+|(?:oh|zero|one|two|three|four|five|six|seven|eight|nine|double|triple|[A-Z])\b))*/g);
  if (!m) return null;
  const decode = (span: string): string | null => {
    let out = "";
    let mult = 1;
    for (const tok of span.split(/[\s,-]+/).filter(Boolean)) {
      const low = tok.toLowerCase();
      if (low === "double") { mult = 2; continue; }
      if (low === "triple") { mult = 3; continue; }
      let ch: string | undefined = DIGIT[low];
      if (!ch && /^[A-Z]$/.test(tok)) ch = tok;
      if (!ch) return null; // e.g. "ten-inch": not a read-back
      out += ch.repeat(mult);
      mult = 1;
    }
    return out;
  };
  for (const span of m.filter((s) => s.includes("-")).sort((a, b) => b.length - a.length)) {
    const text = decode(span);
    if (text && text.length >= 5) return { text, span };
  }
  return null;
}

// ---------------------------------------------------------------- caller brain

function callerSays(reply: string, convo: Convo, persona: Persona, used: Map<Rule, number>): string | null {
  if (/\b(bye|goodbye|ta-ra)\b/i.test(reply)) return null; // Gio ended the call
  const q = lastQuestion(reply);

  for (const rule of convo.rules ?? []) {
    const n = used.get(rule) ?? 0;
    if (n >= rule.say.length) continue;
    if (rule.when.test(rule.scope === "full" ? reply : q)) {
      used.set(rule, n + 1);
      rule.onFire?.(persona);
      return rule.say[n];
    }
  }

  const p = persona;
  if (/still there/i.test(q)) return "yes, sorry";
  if (/all correct|shall I place/i.test(q)) return "yes";
  if (/is that right|is that correct|right number|correct\?/i.test(q)) return "yes";
  if (/cash or card|pay/i.test(q)) return p.payment;
  if (/postcode/i.test(q)) return p.postcode ?? "I'll collect";
  if (/delivery or collection|collection or delivery|collect/i.test(q)) return p.fulfilment;
  if (/address|first line/i.test(q)) return p.address ?? "I'm collecting";
  if (/name/i.test(q)) return p.name;
  if (/number/i.test(q)) return p.phone;
  if (/drinks?|sides?/i.test(q)) return "no thanks";
  if (/size|inch/i.test(q)) return "12 inch";
  if (/call (you )?back|ring you/i.test(q)) return "no thanks";
  if (/anything else|help with/i.test(q)) return "no, that's everything";
  if (q.endsWith("?")) return "no, that's it";
  return "ok";
}

async function chat(messages: unknown[], statusContext: string | undefined) {
  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages, statusContext }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`chat failed: ${json.error ?? res.status}`);
  return json;
}

async function runConversation(convo: Convo, turns: Turn[]): Promise<void> {
  let messages: unknown[] = [];
  let statusContext: string | undefined;
  const persona = convo.persona ? { ...convo.persona } : undefined;
  const used = new Map<Rule, number>();
  const max = convo.maxTurns ?? 24;
  await convo.setup?.();

  let next: string | null = convo.opening[0];
  while (next !== null && turns.length < max) {
    messages.push({ role: "user", content: next });
    const json = await chat(messages, statusContext);
    messages = json.messages;
    statusContext = json.statusContext;
    turns.push({ caller: next, reply: json.reply, toolCalls: json.toolCalls, words: words(json.reply), ms: json.usage.ms, costUsd: json.usage.costUsd });
    process.stdout.write(".");

    if (turns.length < convo.opening.length) next = convo.opening[turns.length];
    else if (persona) next = callerSays(json.reply, convo, persona, used);
    else next = null;
  }
}

// ---------------------------------------------------------------- behaviour checks

function behaviourChecks(r: Result): Check[] {
  const out: Check[] = [];
  const { turns, convo } = r;
  const fail = (rule: string, detail: string) => out.push({ rule, pass: false, detail });

  let upsells = 0;
  const asked: { text: Set<string>; turn: number }[] = [];

  turns.forEach((t, ti) => {
    const at = `turn ${ti + 1}`;
    const reply = t.reply.trim();
    const placing = t.toolCalls.some((c) => c.name === "create_order" && c.input.preview === false);
    const callback = t.toolCalls.some((c) => c.name === "request_callback");
    const readBack = spokenReadBack(reply);

    // 1. One question, then stop.
    const qCount = (reply.match(/\?/g) ?? []).length;
    if (qCount > 1 || (qCount === 1 && !reply.endsWith("?"))) {
      fail("1 one question then stop", `${at}: "${reply}"`);
    }
    // 1. Consequential tools only after a yes in THIS caller line.
    for (const c of t.toolCalls) {
      const consequential =
        c.name === "check_delivery" || c.name === "request_callback" || c.name === "create_booking" || (c.name === "create_order" && c.input.preview === false);
      if (consequential && !YES.test(t.caller.trim())) {
        fail("1 waited for yes before acting", `${at}: ${c.name} called after caller said "${t.caller}"`);
      }
    }

    // 2. Confirmation gate.
    if (placing) {
      const prev = turns[ti - 1];
      if (!prev || !/all correct|shall I place/i.test(prev.reply)) {
        fail("2 confirmation gate", `${at}: placed but previous reply did not ask "Is that all correct?"`);
      }
      if (!YES.test(t.caller.trim())) fail("2 confirmation gate", `${at}: placed after caller said "${t.caller}"`);
      const placedItems = JSON.stringify(t.toolCalls.find((c) => c.name === "create_order" && c.input.preview === false)?.input.items);
      const lastPreview = turns
        .slice(0, ti)
        .flatMap((pt) => pt.toolCalls)
        .filter((c) => c.name === "create_order" && c.input.preview === true)
        .at(-1);
      if (!lastPreview) fail("2 confirmation gate", `${at}: placed with no preview before it`);
      else if (JSON.stringify(lastPreview.input.items) !== placedItems) {
        fail("2 confirmation gate", `${at}: placed items differ from the last read-back`);
      }
      const payAsked = turns.findIndex((pt) => /cash or card/i.test(pt.reply));
      const gateAsked = turns.findIndex((pt) => /all correct/i.test(pt.reply));
      if (payAsked < 0 || gateAsked < 0 || payAsked > gateAsked) {
        fail("2 payment before read-back", `cash/card asked at turn ${payAsked + 1}, read-back at turn ${gateAsked + 1}`);
      }
    }

    // 3. Never goodbye with a read-back.
    const bye = /\b(bye|goodbye|ta-ra)\b/i.test(reply);
    if (bye && (placing || qCount > 0 || readBack || /\bA-\d{3,}\b/.test(reply))) {
      fail("3 no goodbye with read-back", `${at}: "${reply}"`);
    }

    // 4. Upsell exactly once.
    if (/\b(drinks?|sides?)\b/i.test(reply) && !/kebabs/i.test(reply) && !/drink|side|coke|chips/i.test(t.caller)) upsells++;

    // 5. Loops: the same question asked 3+ times.
    if (reply.endsWith("?") && !/still there/i.test(reply)) {
      const set = new Set(reply.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter(Boolean));
      asked.push({ text: set, turn: ti + 1 });
    }

    // 7. Digits: correct, and the whole reply.
    if (readBack) {
      const isPostcode = /[A-Z]/.test(readBack.text);
      const expected = isPostcode ? (convo.postcode ? [pcNorm(convo.postcode)] : []) : (convo.phones ?? []).map(digits);
      if (expected.length && !expected.includes(isPostcode ? pcNorm(readBack.text) : readBack.text)) {
        fail("7 digits read correctly", `${at}: read back "${readBack.span}" = ${readBack.text}, expected ${expected.join(" or ")}`);
      }
      // The booking read-back and the reply after create_booking carry the number by design.
      const bookingReply = t.toolCalls.some((c) => c.name === "create_booking") || /all correct|shall I confirm/i.test(reply);
      if (!placing && !callback && !bookingReply) {
        const rest = reply.replace(readBack.span, " ");
        const extra = words(rest.replace(/[^A-Za-z' ]/g, " "));
        if (extra > 9 || /\d+\.\d\d|minutes?/i.test(rest)) {
          fail("7 digits are the whole reply", `${at}: "${reply}"`);
        }
      }
    }

    // 8. One idea per reply.
    const ideas = [
      /\b\d+\.\d\d\b/.test(reply) && "price",
      /\bminutes?\b|\b\d{1,2}:\d\d\b|o'clock|quarter (past|to)|half past/i.test(reply) && "time",
      /\bA-\d{3,}\b/.test(reply) && "order number",
      !!readBack && "digits",
      qCount > 0 && "question",
    ].filter(Boolean) as string[];
    const gateReadBack = /all correct/i.test(reply);
    if (placing) {
      if (ideas.includes("price") || ideas.includes("time")) fail("8 one idea per reply", `${at} (placed): ${ideas.join(" + ")}: "${reply}"`);
    } else if (!gateReadBack && ideas.length >= 3) {
      fail("8 one idea per reply", `${at}: ${ideas.join(" + ")}: "${reply}"`);
    }
    if (t.words > 25) fail("8 under 25 words", `${at}: ${t.words} words`);
  });

  if (upsells > 1) fail("4 upsell exactly once", `drinks/sides mentioned in ${upsells} replies`);

  // Cluster similar questions (Jaccard ≥ 0.6 on words).
  const jac = (a: Set<string>, b: Set<string>) => {
    let i = 0;
    for (const x of a) if (b.has(x)) i++;
    return i / (a.size + b.size - i);
  };
  const seen = new Set<number>();
  for (let i = 0; i < asked.length; i++) {
    if (seen.has(i)) continue;
    const group = [asked[i]];
    for (let j = i + 1; j < asked.length; j++) {
      if (!seen.has(j) && jac(asked[i].text, asked[j].text) >= 0.6) {
        group.push(asked[j]);
        seen.add(j);
      }
    }
    if (group.length >= 3) fail("5 never ask a third time", `same question at turns ${group.map((g) => g.turn).join(", ")}`);
  }

  // Report a pass for every rule this conversation exercised without a failure.
  const failed = new Set(out.map((c) => c.rule));
  for (const rule of [
    "1 one question then stop",
    "1 waited for yes before acting",
    "3 no goodbye with read-back",
    "4 upsell exactly once",
    "5 never ask a third time",
    "7 digits read correctly",
    "7 digits are the whole reply",
    "8 one idea per reply",
    "8 under 25 words",
  ]) {
    if (!failed.has(rule)) out.push({ rule, pass: true, detail: "" });
  }
  if (placedOrders(r).length && !failed.has("2 confirmation gate")) out.push({ rule: "2 confirmation gate", pass: true, detail: "" });
  if (placedOrders(r).length && !failed.has("2 payment before read-back")) out.push({ rule: "2 payment before read-back", pass: true, detail: "" });
  return out;
}

// ---------------------------------------------------------------- main

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ALL_DAY = Object.fromEntries(
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [{ open: "00:00", close: "00:00" }]]),
);

async function cleanup(results: Result[]) {
  const orders = new Set<string>();
  const callbacks = new Set<string>();
  for (const c of results.flatMap((r) => r.turns).flatMap((t) => t.toolCalls)) {
    if (c.name === "create_order" && c.result.order_number) orders.add(String(c.result.order_number));
    if (c.name === "request_callback" && c.result.callback_id) callbacks.add(String(c.result.callback_id));
  }
  const bookings = new Set<string>(seededBookings);
  for (const c of results.flatMap((r) => r.turns).flatMap((t) => t.toolCalls)) {
    if (c.name === "create_booking" && c.result.booking_reference) bookings.add(String(c.result.booking_reference));
  }
  if (bookings.size) {
    const { error } = await db.from("bookings").delete().eq("restaurant_id", RID).in("booking_reference", [...bookings]);
    console.log(error ? `!!! booking cleanup failed: ${error.message}` : `Deleted test bookings: ${[...bookings].join(", ")}`);
  }
  const toDelete = [...orders].filter((o) => !KEEP_ORDERS.has(o));
  if (toDelete.length) {
    const { error } = await db.from("orders").delete().eq("restaurant_id", RID).in("order_number", toDelete);
    console.log(error ? `!!! order cleanup failed: ${error.message}` : `Deleted test orders: ${toDelete.join(", ")}`);
  }
  if (callbacks.size) {
    const { error } = await db.from("callback_requests").delete().in("id", [...callbacks]);
    console.log(error ? `!!! callback cleanup failed: ${error.message}` : `Deleted ${callbacks.size} test callback(s)`);
  }
  return { orders: toDelete, callbacks: [...callbacks] };
}

async function main() {
  await fetch(CHAT_URL, { method: "POST", body: "{}" }).catch(() => {
    throw new Error("Dev server not running on localhost:3000 — start it with npm run dev");
  });

  // Optional: run only some tests, e.g. `... conversation-tests.ts 9 10 11`.
  const only = process.argv.slice(2).map(Number).filter(Boolean);

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
  const results: Result[] = [];
  process.on("SIGINT", async () => {
    await restore();
    await cleanup(results);
    process.exit(130);
  });

  try {
    // 2) Open all day for the run.
    const { error: openErr } = await db.from("restaurants").update({ opening_hours: ALL_DAY }).eq("id", RID);
    if (openErr) throw new Error(`could not set test hours: ${openErr.message}`);

    for (const [i, c] of CONVERSATIONS.entries()) {
      if (only.length && !only.includes(i + 1)) continue;
      process.stdout.write(`Test ${i + 1} (${c.title}) `);
      const r: Result = { n: i + 1, convo: c, turns: [] };
      results.push(r);
      try {
        await runConversation(c, r.turns);
      } catch (e) {
        r.error = String(e);
      }
      process.stdout.write("\n");
    }
  } finally {
    await restore();
  }

  // 3) Checks.
  const table: { n: number; title: string; checks: Check[] }[] = results.map((r) => ({
    n: r.n,
    title: r.convo.title,
    checks: [
      ...(r.error ? [{ rule: "ran", pass: false, detail: r.error }] : []),
      ...behaviourChecks(r),
      ...(r.convo.check?.(r) ?? []),
    ],
  }));

  // 4) Clean up every order and callback the run created.
  const deleted = await cleanup(results);

  // 5) Write the report.
  const totalCost = results.flatMap((r) => r.turns).reduce((s, t) => s + t.costUsd, 0);
  let md = `# Phase 2 conversation tests\n\nRun: ${new Date().toISOString()} · model claude-haiku-5-5 · total cost $${totalCost.toFixed(4)}\n\n`;
  md += `Cleaned up afterwards: ${deleted.orders.length} order(s) [${deleted.orders.join(", ")}], ${deleted.callbacks.length} callback(s).\n\n`;
  md += `## Pass / fail\n\n| Test | Result | Failed checks |\n|---|---|---|\n`;
  for (const row of table) {
    const failed = row.checks.filter((c) => !c.pass);
    md += `| ${row.n}. ${row.title} | ${failed.length ? "❌ FAIL" : "✅ PASS"} | ${failed.map((c) => c.rule).join("; ") || "—"} |\n`;
  }
  md += `\n## Failures in detail\n\n`;
  const fails = table.flatMap((row) => row.checks.filter((c) => !c.pass).map((c) => `- **Test ${row.n}** · ${c.rule} · ${c.detail}`));
  md += `${fails.join("\n") || "- none"}\n\n`;
  md += `## Scenario checks\n\n`;
  for (const row of table) {
    for (const c of row.checks.filter((c) => c.detail && c.pass)) md += `- Test ${row.n} · ${c.rule} · ${c.detail}: PASS\n`;
  }
  md += `\n`;
  for (const r of results) {
    md += `## Test ${r.n}: ${r.convo.title}\n\n`;
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

  console.log("\nTest | Result | Failed checks");
  for (const row of table) {
    const failed = row.checks.filter((c) => !c.pass);
    console.log(`${row.n}. ${row.title} | ${failed.length ? "FAIL" : "PASS"} | ${failed.map((c) => `${c.rule}: ${c.detail}`).join(" ;; ") || "-"}`);
  }
  console.log(`\nTranscripts: ${OUT_DIR}/phase2-conversations.md · total cost $${totalCost.toFixed(4)}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
