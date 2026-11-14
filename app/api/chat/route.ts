import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { DEMO_RESTAURANT_ID, TOOLS, type ToolName } from "@/lib/agent/tools";
import { POST as searchMenu } from "@/app/api/tools/search-menu/route";
import { POST as checkDelivery } from "@/app/api/tools/check-delivery/route";
import { POST as createOrder } from "@/app/api/tools/create-order/route";
import { POST as requestCallback } from "@/app/api/tools/request-callback/route";
import { POST as checkAvailability } from "@/app/api/tools/check-availability/route";
import { POST as createBooking } from "@/app/api/tools/create-booking/route";
import { POST as restaurantStatus } from "@/app/api/tools/restaurant-status/route";
import { STATUS_PLACEHOLDER, buildStatusContext } from "@/lib/agent/status-context";
import type { RestaurantStatus } from "@/lib/restaurant-status";

// TEXT TEST RIG — imitates what Vapi will do in Phase 4:
// run the LLM with our system prompt + tools, execute tool calls against our
// own endpoints, loop until the agent has something to say.
//
// DEVELOPMENT ONLY. In production this route returns 404, so it can never be
// used as a free LLM endpoint by the public.

// Fast and cheap: $0.10 per million input tokens, $0.50 per million output.
const MODEL = "claude-haiku-5-5";
const PRICE_PER_MTOK = { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 };
const MAX_TOOL_ROUNDS = 8; // safety stop so a confused model can't loop forever

const HANDLERS: Record<ToolName, (req: Request) => Promise<Response>> = {
  search_menu: searchMenu,
  check_delivery: checkDelivery,
  create_order: createOrder,
  request_callback: requestCallback,
  check_availability: checkAvailability,
  create_booking: createBooking,
};

type ToolCallLog = { name: string; input: unknown; status: number; result: unknown; ms: number };
type Usage = { input: number; output: number; cacheWrite: number; cacheRead: number };

/** Calls one of our tool endpoints exactly the way Vapi will: POST + x-tool-secret. */
async function runTool(name: string, input: Record<string, unknown>): Promise<ToolCallLog> {
  const start = performance.now();
  const handler = HANDLERS[name as ToolName];
  if (!handler) {
    return { name, input, status: 404, result: { error: `unknown tool ${name}` }, ms: 0 };
  }
  // The model never chooses restaurant_id — we inject it here.
  const body = { ...input, restaurant_id: DEMO_RESTAURANT_ID, ...(name === "create_order" ? { call_id: "test-chat" } : {}) };
  const res = await handler(
    new Request(`http://localhost/api/tools/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-tool-secret": process.env.TOOL_API_SECRET ?? "" },
      body: JSON.stringify(body),
    }),
  );
  const result = await res.json().catch(() => ({ error: "tool returned invalid JSON" }));
  return { name, input, status: res.status, result, ms: Math.round(performance.now() - start) };
}

/**
 * Start of call: ask our restaurant-status endpoint (exactly as our Phase 4
 * Vapi webhook will) and turn the answer into the RESTAURANT STATUS block.
 */
async function fetchStatusContext(): Promise<string> {
  const res = await restaurantStatus(
    new Request("http://localhost/api/tools/restaurant-status", {
      method: "POST",
      headers: { "content-type": "application/json", "x-tool-secret": process.env.TOOL_API_SECRET ?? "" },
      body: JSON.stringify({ restaurant_id: DEMO_RESTAURANT_ID }),
    }),
  );
  const status = res.ok ? ((await res.json()) as RestaurantStatus) : null;
  return buildStatusContext(status);
}

function costUsd(u: Usage): number {
  return (
    (u.input * PRICE_PER_MTOK.input +
      u.output * PRICE_PER_MTOK.output +
      u.cacheWrite * PRICE_PER_MTOK.cacheWrite +
      u.cacheRead * PRICE_PER_MTOK.cacheRead) /
    1_000_000
  );
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set in .env.local" }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as
    | { messages?: Anthropic.MessageParam[]; statusContext?: string }
    | null;
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 200 || messages.at(-1)?.role !== "user") {
    return NextResponse.json({ error: "body must be { messages: MessageParam[] } ending with a user message" }, { status: 400 });
  }

  // The status is fetched ONCE at the start of the call and then sent back by
  // the page on every turn, so it stays fixed for the whole call (like Vapi's
  // variableValues) and the cached prompt prefix doesn't change mid-call.
  const statusContext =
    typeof body?.statusContext === "string" && body.statusContext.length < 2000
      ? body.statusContext
      : await fetchStatusContext();
  const system = SYSTEM_PROMPT.replace(STATUS_PLACEHOLDER, statusContext);

  const client = new Anthropic();
  const toolCalls: ToolCallLog[] = [];
  const usage: Usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  const turnStart = performance.now();
  let reply = "";

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        // Low effort: a phone agent needs speed more than deep reasoning.
        output_config: { effort: "low" },
        // Caches the system prompt + tools + history, so each round is cheaper.
        cache_control: { type: "ephemeral" },
        system,
        tools: TOOLS as unknown as Anthropic.Tool[],
        messages,
      });

      usage.input += response.usage.input_tokens;
      usage.output += response.usage.output_tokens;
      usage.cacheWrite += response.usage.cache_creation_input_tokens ?? 0;
      usage.cacheRead += response.usage.cache_read_input_tokens ?? 0;

      // Keep the full content (including thinking blocks) unchanged in history.
      messages.push({ role: "assistant", content: response.content });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join(" ")
        .trim();
      if (text) reply = reply ? `${reply} ${text}` : text;

      if (response.stop_reason === "refusal") {
        reply = "Sorry, I can't help with that. Is there anything I can get you from the menu?";
        break;
      }
      if (response.stop_reason !== "tool_use") break;

      // Run every tool call in parallel and return all results in ONE user message.
      const uses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const results = await Promise.all(uses.map((u) => runTool(u.name, u.input as Record<string, unknown>)));
      toolCalls.push(...results);
      messages.push({
        role: "user",
        content: uses.map((u, i) => ({
          type: "tool_result" as const,
          tool_use_id: u.id,
          content: JSON.stringify(results[i].result),
          // 400s are normal "ask the caller" answers (with speech); only real failures are errors.
          is_error: results[i].status >= 500 ? true : undefined,
        })),
      });

      if (round === MAX_TOOL_ROUNDS - 1) {
        reply = reply || "Sorry, let me take your number and someone will call you straight back.";
      }
    }
  } catch (error) {
    console.error("[chat] Anthropic call failed", error);
    const message =
      error instanceof Anthropic.AuthenticationError ? "Anthropic rejected the API key"
      : error instanceof Anthropic.RateLimitError ? "Rate limited by Anthropic, try again in a moment"
      : error instanceof Anthropic.APIError ? `Anthropic API error ${error.status}`
      : "Chat failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const cost = costUsd(usage);
  const ms = Math.round(performance.now() - turnStart);
  console.log(
    `[chat] turn: ${ms}ms, ${toolCalls.length} tool call(s) [${toolCalls.map((t) => t.name).join(", ")}], ` +
      `tokens in=${usage.input} out=${usage.output} cacheWrite=${usage.cacheWrite} cacheRead=${usage.cacheRead}, ` +
      `cost=$${cost.toFixed(5)}`,
  );

  return NextResponse.json({ reply, toolCalls, messages, statusContext, usage: { ...usage, costUsd: cost, ms } });
}
