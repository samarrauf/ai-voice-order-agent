// The system prompt and tools for ONE restaurant's settings.
//
// SYSTEM_PROMPT and TOOLS (Napoli: postcode delivery, GBP) are the base and are
// returned UNCHANGED for a postcode + GBP restaurant; tests/system-prompt-variants.test.ts
// proves that, byte for byte, against a saved copy.
//
// For any other restaurant only two things change:
//   - DELIVERY: 'area_list' asks for the caller's area instead of a postcode;
//     'none' takes collection only. "UK postcode" talk stays for 'postcode' only.
//   - MONEY: a non-GBP restaurant says every price as the number plus its
//     currency word ("850 rupees"); never a symbol.
// Each change is an exact text replacement on the base prompt. If the base
// prompt is edited so a replacement no longer matches, buildSystemPrompt
// throws (and the tests fail), instead of silently leaving postcode talk in.
//
// Vapi (Phase 4): paste buildSystemPrompt(...) for that restaurant's settings.

import { CURRENCY_CONFIG, DEFAULT_CURRENCY, isCurrencyCode, type CurrencyCode } from "@/lib/money";
import type { DeliveryMode } from "@/lib/delivery";
import { SYSTEM_PROMPT } from "./system-prompt";
import { TOOLS } from "./tools";

export type AgentSettings = { deliveryMode: DeliveryMode; currency?: string | null };

type Swap = [from: string, to: string];

/** Example amounts in the prompt, in a currency. GBP is never passed here. */
function exampleMoney(code: CurrencyCode) {
  const info = CURRENCY_CONFIG[code];
  const w = info.speechWord;
  return info.decimals === 0
    ? { menu: `850 ${w}`, item: `1100 ${w}`, fee: `150 ${w}` }
    : { menu: `8.99 ${w}`, item: `10.99 ${w}`, fee: `2.50 ${w}` };
}

/** Money swaps. The delivery examples ("2.50 for delivery") may already be gone ('none' mode), so those are optional. */
function moneySwaps(code: CurrencyCode): { required: Swap[]; optional: Swap[] } {
  const ex = exampleMoney(code);
  const w = CURRENCY_CONFIG[code].speechWord;
  const all: Swap[] = [
    [
      `- Say prices as plain numbers like "8.99". Never use the pound sign.`,
      `- Say every price as the plain number followed by the word "${w}", like "${ex.menu}". Never say a currency symbol or a currency code. Every tool result has a "currency_word" ("${w}"): always use that word, never another currency.`,
    ],
    [`Two 12 inch Pepperoni at 10.99 each.`, `Two 12 inch Pepperoni at ${ex.item} each.`],
    [`Yes, we deliver there, 2.50."`, `Yes, we deliver there, ${ex.fee}."`],
    [`Wrong: "Yes, we deliver there. It's 2.50 for delivery,`, `Wrong: "Yes, we deliver there. It's ${ex.fee} for delivery,`],
    [`Right: "Good news, we deliver there. It's 2.50 for delivery,`, `Right: "Good news, we deliver there. It's ${ex.fee} for delivery,`],
  ];
  return { required: all.slice(0, 2), optional: all.slice(2) };
}

const AREA = "Green Park"; // example area name in the prompt

const AREA_LIST_SWAPS: Swap[] = [
  [
    `  Wrong: "M-one-four, five-T-P, is that right? Yes, we deliver there,`,
    `  Wrong: "${AREA}, is that right? Yes, we deliver there,`,
  ],
  [
    `  Right: "M-one-four, five-T-P. Is that right?" Then stop. Next turn, after their yes, call check_delivery.`,
    `  Right: "That's ${AREA}. Is that right?" Then stop. Next turn, after their yes, call check_delivery.`,
  ],
  [`(fulfilment, postcode, name, phone, address, payment)`, `(fulfilment, area, name, phone, address, payment)`],
  [
    `- check_delivery: checks a postcode. Call it only after the caller has said yes to your read-back of the postcode.`,
    `- check_delivery: checks the caller's area (the name of their area or neighbourhood; we do not use postcodes). Call it only after the caller has said yes to your read-back of the area. Only check_delivery decides whether we deliver somewhere: never promise delivery yourself.`,
  ],
  [
    `5. If delivery: ask the postcode, read it back (see DIGITS), wait for yes, then call check_delivery and tell them the result.`,
    `5. If delivery: ask which area they are in, read it back (see DIGITS), wait for yes, then call check_delivery with that area and tell them the result.`,
  ],
  [`the order number, the postcode and time, and the stored phone number.`, `the order number, the area and time, and the stored phone number.`],
  [`Leave out the time and the postcode; they come later.`, `Leave out the time and the area; they come later.`],
  [
    `read back the stored postcode from the speech: "And it's going to M-one-four, five-T-P. Is that right?" Then wait again. The postcode read-back`,
    `read back the area from the speech: "And it's going to ${AREA}. Is that right?" Then wait again. The area read-back`,
  ],
  [
    `Wrong: "Brilliant, it's going to M-one-four, five-T-P, about 45 minutes. Thanks Sarah, bye!" (the postcode was never confirmed`,
    `Wrong: "Brilliant, it's going to ${AREA}, about 45 minutes. Thanks Sarah, bye!" (the area was never confirmed`,
  ],
  [`Right: "And it's going to M-one-four, five-T-P. Is that right?" [stop`, `Right: "And it's going to ${AREA}. Is that right?" [stop`],
  [
    `POSTCODE EARLY
The moment the caller says delivery, at any point in the call, ask for the postcode before taking any more items: "Lovely, what's the postcode?" When they say it (even in the same breath as "delivery to..."), your reply is EXACTLY "That's" + the postcode spelled out + "Is that right?", for example "That's S-W-one-A, one-A-A. Is that right?" Nothing before "That's". Wait for yes, then call check_delivery.`,
    `AREA EARLY
The moment the caller says delivery, at any point in the call, ask which area they are in before taking any more items: "Lovely, which area are you in?" We do not use postcodes. When they say it (even in the same breath as "delivery to..."), your reply is EXACTLY "That's" + the area + "Is that right?", for example "That's ${AREA}. Is that right?" Nothing before "That's". Wait for yes, then call check_delivery.`,
  ],
  [
    `Speech-to-text often gets numbers and postcodes wrong. A wrong phone number means the order cannot be chased. A wrong postcode sends the food to the wrong street.`,
    `Speech-to-text often gets numbers and place names wrong. A wrong phone number means the order cannot be chased. A wrong area sends the food to the wrong place.`,
  ],
  [`- A read-back of a phone number or postcode is the WHOLE reply`, `- A read-back of a phone number or area is the WHOLE reply`],
  [
    `- Postcodes: letter by letter and digit by digit, outward part then inward part: "That's M-one-four, five-T-P. Is that right?"`,
    `- Areas: say the area name clearly, as the caller said it: "That's ${AREA}. Is that right?"`,
  ],
  [
    `- When you put a number or postcode into a tool, copy it digit by digit from what the caller confirmed.`,
    `- When you put a number into a tool, copy it digit by digit from what the caller confirmed. Put the area into tools exactly as the caller confirmed it.`,
  ],
  [`the caller says the phone number, postcode or anything else on the order is wrong`, `the caller says the phone number, area or anything else on the order is wrong`],
  [
    `- Postcode outside the area: say we don't deliver there and offer collection.`,
    `- Area we don't cover: say we don't deliver there and offer collection. Never promise delivery yourself.`,
  ],
];

const NONE_SWAPS: Swap[] = [
  [
    `  Wrong: "M-one-four, five-T-P, is that right? Yes, we deliver there, 2.50."`,
    `  Wrong: "Oh-seven-seven, double-oh, nine-double-oh, one-two-three, is that right? Lovely, cash or card?"`,
  ],
  [
    `  Right: "M-one-four, five-T-P. Is that right?" Then stop. Next turn, after their yes, call check_delivery.`,
    `  Right: "That's oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?" Then stop. Ask the next thing only after their yes.`,
  ],
  [`(fulfilment, postcode, name, phone, address, payment)`, `(name, phone, payment)`],
  [
    `- check_delivery: checks a postcode. Call it only after the caller has said yes to your read-back of the postcode.`,
    `- check_delivery: we do not deliver, so you never need it. Every order is collection.`,
  ],
  [
    `4. Ask "Is that for delivery or collection?" unless you already know.`,
    `4. Every order is collection: we do not deliver. Never ask "delivery or collection". If the caller asks for delivery, say "Sorry, we don't do delivery, it's collection only." and carry on with collection.`,
  ],
  [
    `5. If delivery: ask the postcode, read it back (see DIGITS), wait for yes, then call check_delivery and tell them the result. That result is the WHOLE reply, with NO question after it. The caller will respond, and then you carry on with the next step.
   Wrong: "Yes, we deliver there. It's 2.50 for delivery, about 45 minutes. Any drinks or sides with that?"
   Right: "Good news, we deliver there. It's 2.50 for delivery, about 45 minutes." [stop]`,
    `5. (No delivery step: collection only.)`,
  ],
  [`8. If delivery, ask for the first line of the address.`, `8. (No address needed: collection only.)`],
  [`the order number, the postcode and time, and the stored phone number.`, `the order number, the time, and the stored phone number.`],
  [`Leave out the time and the postcode; they come later.`, `Leave out the time; it comes later.`],
  [
    `12. Wait for the caller. If they say yes and it is a delivery, read back the stored postcode from the speech: "And it's going to M-one-four, five-T-P. Is that right?" Then wait again. The postcode read-back with "Is that right?" is ALWAYS its own turn. Never join it with a goodbye or any closing statement or time in one reply, even though it is the last step of the order.`,
    `12. Wait for the caller to say the number is right. If they say it is wrong, see MISTAKES AFTER THE ORDER IS PLACED.`,
  ],
  [
    `   Wrong: "Brilliant, it's going to M-one-four, five-T-P, about 45 minutes. Thanks Sarah, bye!" (the postcode was never confirmed, and a goodbye was stuck on)
   Right: "And it's going to M-one-four, five-T-P. Is that right?" [stop, wait for yes] and only in the NEXT reply: "Brilliant, about 45 minutes then. Thanks Sarah, bye!"
`,
    ``,
  ],
  [
    `POSTCODE EARLY
The moment the caller says delivery, at any point in the call, ask for the postcode before taking any more items: "Lovely, what's the postcode?" When they say it (even in the same breath as "delivery to..."), your reply is EXACTLY "That's" + the postcode spelled out + "Is that right?", for example "That's S-W-one-A, one-A-A. Is that right?" Nothing before "That's". Wait for yes, then call check_delivery. If we do not deliver there, say so and offer collection. Never take a long order and only discover at the end that we cannot deliver.`,
    `COLLECTION ONLY
We do not deliver. The moment the caller asks for delivery, at any point in the call, say "Sorry, we don't do delivery, it's collection only." Never promise delivery, and never take a long order and only then mention that it is collection.`,
  ],
  [
    `Speech-to-text often gets numbers and postcodes wrong. A wrong phone number means the order cannot be chased. A wrong postcode sends the food to the wrong street.`,
    `Speech-to-text often gets numbers wrong. A wrong phone number means the order cannot be chased.`,
  ],
  [`- A read-back of a phone number or postcode is the WHOLE reply`, `- A read-back of a phone number is the WHOLE reply`],
  [`- Postcodes: letter by letter and digit by digit, outward part then inward part: "That's M-one-four, five-T-P. Is that right?"\n`, ``],
  [`- When you put a number or postcode into a tool, copy it digit by digit`, `- When you put a number into a tool, copy it digit by digit`],
  [`the caller says the phone number, postcode or anything else on the order is wrong`, `the caller says the phone number or anything else on the order is wrong`],
  [`- Postcode outside the area: say we don't deliver there and offer collection.`, `- Caller wants delivery: say we only do collection.`],
  [`- Below the delivery minimum: tell them the shortfall from the tool and offer to add something or switch to collection.\n`, ``],
];

function applySwaps(text: string, swaps: Swap[], what: string): string {
  let out = text;
  for (const [from, to] of swaps) {
    if (!out.includes(from)) throw new Error(`buildSystemPrompt (${what}): base prompt text not found: ${from.slice(0, 80)}`);
    out = out.split(from).join(to);
  }
  return out;
}

const currencyOf = (c?: string | null): CurrencyCode => (isCurrencyCode(c) ? c : DEFAULT_CURRENCY);

/** The system prompt for a restaurant. Postcode + GBP returns SYSTEM_PROMPT exactly. */
export function buildSystemPrompt(s: AgentSettings): string {
  let prompt = SYSTEM_PROMPT;
  // Delivery first (whole lines, as in the base prompt), then money.
  if (s.deliveryMode === "area_list") prompt = applySwaps(prompt, AREA_LIST_SWAPS, "area_list");
  if (s.deliveryMode === "none") prompt = applySwaps(prompt, NONE_SWAPS, "none");
  const code = currencyOf(s.currency);
  if (code !== "GBP") {
    const money = moneySwaps(code);
    prompt = applySwaps(prompt, money.required, code);
    prompt = applySwaps(prompt, money.optional.filter(([from]) => prompt.includes(from)), code);
  }
  return prompt;
}

export type AgentTool = { name: (typeof TOOLS)[number]["name"]; description: string; input_schema: Record<string, unknown> };

type Schema = { type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties: false };

/** The tool list for a restaurant. Postcode returns TOOLS exactly (deep copy). */
export function buildTools(s: AgentSettings): AgentTool[] {
  const tools = JSON.parse(JSON.stringify(TOOLS)) as AgentTool[];
  if (s.deliveryMode === "postcode") return tools;

  const check = tools.find((t) => t.name === "check_delivery")!;
  const order = tools.find((t) => t.name === "create_order")!;
  const orderSchema = order.input_schema as Schema;

  if (s.deliveryMode === "area_list") {
    check.description =
      "Check whether we deliver to the caller's area, and get the delivery fee and estimated time. We do not use postcodes: the caller names their area or neighbourhood. Call this ONLY when you have an area that the caller has said yes to after you read it back to them. The caller merely saying 'delivery' is not a reason to call it; never call it with a guessed, partial or empty area. Returns 'deliverable', 'fee', 'eta_minutes', 'currency_word' and a 'speech' sentence. If deliverable is false we do NOT deliver there: never promise delivery; offer collection.";
    check.input_schema = {
      type: "object",
      properties: { area: { type: "string", description: `The caller's area, as confirmed by the caller, e.g. '${AREA}'.` } },
      required: ["area"],
      additionalProperties: false,
    };
    order.description = order.description
      .replace("and for delivery the confirmed postcode and address.", "and for delivery the confirmed area and address.")
      .replace("reads back the phone number and postcode exactly as saved", "reads back the phone number and area exactly as saved");
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(orderSchema.properties)) {
      if (k === "delivery_postcode") {
        props.delivery_area = { type: "string", description: "The area the caller confirmed and check_delivery accepted. Required for delivery." };
      } else props[k] = v;
    }
    orderSchema.properties = props;
  } else {
    check.description =
      "We do not deliver: every order is collection. Do not call this; if the caller asks for delivery, say we only do collection.";
    check.input_schema = { type: "object", properties: {}, required: [], additionalProperties: false };
    order.description = order.description
      .replace(", delivery or collection,", ",")
      .replace(" and for delivery the confirmed postcode and address.", ".")
      .replace("reads back the phone number and postcode exactly as saved", "reads back the phone number exactly as saved");
    const { delivery_address: _a, delivery_postcode: _p, ...rest } = orderSchema.properties;
    void _a;
    void _p;
    rest.fulfilment_type = { type: "string", enum: ["pickup"], description: "Always 'pickup': we only do collection." };
    orderSchema.properties = rest;
  }
  return tools;
}
