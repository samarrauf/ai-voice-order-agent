// The RESTAURANT STATUS block, injected into the system prompt at the START of
// every call, so the agent knows whether we're open from its very first word
// (instead of discovering "closed" only when create_order fails at the end).
//
// HOW IT WORKS
// SYSTEM_PROMPT ends with the placeholder {{restaurant_status}}. Before the
// first turn, the caller of the LLM replaces it with buildStatusContext(...).
//   - Text test rig (now): app/api/chat/route.ts does the replacement.
//   - Vapi (Phase 4): Vapi replaces {{...}} placeholders itself from
//     "variableValues", using exactly the same text.
//
// WHAT TO CONFIGURE IN VAPI (Phase 4)
// 1. Paste SYSTEM_PROMPT into the assistant's system prompt unchanged,
//    including the final line {{restaurant_status}}.
// 2. On the Vapi phone number, set the "Server URL" to our endpoint
//    (to be built in Phase 4, e.g. /api/vapi/assistant-request) instead of
//    fixing an assistant on the number. At the start of each inbound call Vapi
//    sends an "assistant-request" message to that URL.
// 3. That endpoint replies with the assistant to use plus the variable:
//      {
//        "assistantId": "<our assistant id>",
//        "assistantOverrides": {
//          "variableValues": {
//            "restaurant_status": buildStatusContext(await getRestaurantStatus(RESTAURANT_ID))
//          }
//        }
//      }
//    Vapi then fills {{restaurant_status}} in the prompt before the first word.
// (Check the field names against Vapi's current docs when wiring Phase 4.)

import type { RestaurantStatus } from "@/lib/restaurant-status";

export const STATUS_PLACEHOLDER = "{{restaurant_status}}";

/**
 * Today and the next 13 days with exact dates, so the agent can turn "this
 * Saturday" or "tomorrow" into a YYYY-MM-DD date for table bookings without
 * doing calendar maths. The restaurant is in the UK, so the date is London's.
 */
function calendarLine(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const days = Array.from({ length: 14 }, (_, k) => {
    const d = new Date(Date.UTC(g("year"), g("month") - 1, g("day") + k));
    const weekday = d.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
    return `${weekday} ${d.toISOString().slice(0, 10)}`;
  });
  return `Dates for table bookings. Today is ${days[0]}. Coming days: ${days.slice(1).join(", ")}.`;
}

export function buildStatusContext(s: RestaurantStatus | null, now = new Date()): string {
  const header = "RESTAURANT STATUS (filled in automatically at the start of this call)";
  if (!s) {
    return `${header}\nStatus unknown. Take the order as normal; create_order will say if we are closed.\n${calendarLine(now)}`;
  }
  const lines = [header, `Time now in Manchester: ${s.now_local}.`, calendarLine(now)];
  if (!s.accepting_orders) {
    lines.push(
      "RIGHT NOW: the restaurant is NOT TAKING ORDERS. Apologise, take no order, and offer a callback if they want one.",
    );
  } else if (s.is_open) {
    lines.push("RIGHT NOW: the restaurant is OPEN. Take orders as normal.");
  } else {
    lines.push(
      `RIGHT NOW: the restaurant is CLOSED. It next opens at ${s.next_open_spoken} (${s.next_open_local}). ` +
        `You may take pre-orders for ${s.next_open_local} or later.`,
    );
  }
  return lines.join("\n");
}
