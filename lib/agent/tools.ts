// The tools the voice agent can call, in the JSON-schema shape that both the
// Anthropic API and Vapi accept. In Phase 4, copy each tool's name,
// description and input_schema (Vapi calls it "parameters") into Vapi.
//
// restaurant_id is deliberately NOT a parameter: the model must never be able
// to choose or invent it. The server injects it on every call.

export const DEMO_RESTAURANT_ID = "11111111-1111-1111-1111-111111111111"; // Napoli Pizza & Grill (supabase/seed.sql)

export const TOOLS = [
  {
    name: "search_menu",
    description:
      "Look up a menu item by what the caller said. Fuzzy and alias-aware, so pass the caller's words as heard, e.g. 'peperoni' or 'meat fest'. Returns matching items with their ids, availability, prices and sizes, plus a 'speech' sentence to say. Call this for every item the caller names, before quoting any price or adding it to the order.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The item as the caller said it, e.g. 'large pepperoni' or 'garlic bread with cheese'.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "check_delivery",
    description:
      "Check whether we deliver to a UK postcode, and get the delivery fee and estimated time. Call this ONLY when you have a postcode that the caller has said yes to after you read it back to them. The caller merely saying 'delivery' is not a reason to call it; never call it with a guessed, partial or empty postcode. Returns 'deliverable', 'fee', 'eta_minutes' and a 'speech' sentence.",
    input_schema: {
      type: "object",
      properties: {
        postcode: {
          type: "string",
          description: "The caller's full postcode, as confirmed by the caller, e.g. 'M14 5TP'.",
        },
      },
      required: ["postcode"],
      additionalProperties: false,
    },
  },
  {
    name: "create_order",
    description:
      "Price or place the order. All prices are calculated by the server from the menu. Call it with preview=true ONLY once you have every required detail from the caller: the items (ids from search_menu), delivery or collection, their name, a phone number they confirmed on read-back, the payment method, and for delivery the confirmed postcode and address. Never fill a field with a placeholder or guess. Nothing is saved on a preview; it returns the exact total for the read-back. Call it with preview=false ONLY after the caller has said a clear yes to 'Is that all correct?' for that exact preview; the payment answer or any other reply is not a yes. That returns the order number and a 'speech' that reads back the phone number and postcode exactly as saved. Never call with preview=false twice in one call, even if the caller later corrects a detail. If the order has a problem (unavailable item, wrong size, below minimum), 'success' is false and 'speech' says what to ask the caller.",
    input_schema: {
      type: "object",
      properties: {
        preview: {
          type: "boolean",
          description: "true = price only, do not place. false = place the order for real. Only use false after the caller has said a clear yes to 'Is that all correct?'.",
        },
        fulfilment_type: { type: "string", enum: ["delivery", "pickup"], description: "'pickup' means collection." },
        customer_name: { type: "string", description: "The caller's name." },
        customer_phone: { type: "string", description: "Contact number, digits only, copied digit by digit from what the caller confirmed." },
        delivery_address: { type: "string", description: "First line of the address. Required for delivery." },
        delivery_postcode: { type: "string", description: "Postcode as confirmed by the caller. Required for delivery." },
        payment_method: { type: "string", enum: ["cash", "card_on_delivery"], description: "'card_on_delivery' if they say card." },
        requested_time: {
          type: "string",
          description:
            "Pre-orders only: the time the caller wants it, as 24-hour Manchester time 'HH:MM', e.g. '16:15'. Required when the restaurant is closed; omit for as soon as possible. The server works out the date.",
        },
        notes: { type: "string", description: "Optional note for the whole order, e.g. 'ring the bell twice'." },
        items: {
          type: "array",
          description: "Every item in the order.",
          items: {
            type: "object",
            properties: {
              menu_item_id: { type: "string", description: "The 'id' from a search_menu match. Never invent one." },
              size_name: { type: "string", description: "Exactly one of the size names from search_menu, e.g. '12 inch'. Omit for items without sizes." },
              quantity: { type: "integer", minimum: 1, maximum: 20 },
              options: {
                type: "array",
                items: { type: "string" },
                description: "Extras the caller asked for, e.g. ['Extra cheese', 'Stuffed crust'].",
              },
              notes: { type: "string", description: "Optional note for this item, e.g. 'well done'." },
            },
            required: ["menu_item_id", "quantity"],
            additionalProperties: false,
          },
        },
      },
      required: ["preview", "fulfilment_type", "customer_name", "customer_phone", "payment_method", "items"],
      additionalProperties: false,
    },
  },
  {
    name: "check_availability",
    description:
      "Check whether we have a free table for a party at a date and time. Call this ONLY when the caller has clearly said they want to reserve a table AND you already have all three of: the date, the time and how many people. The word 'table' or 'booking' on its own is not a reason to call it, and never call it with a guessed, partial or missing date, time or party size. The party size must be a number the caller said themselves, in their own words: never assume one (for example 1) or use a default just to run the check; if they have not told you how many people, ask and wait. It only looks; it reserves nothing. Do not call it for a party of more than 8: those cannot be booked this way. Returns 'available' (true or false) and a 'speech' sentence to say. If available is false the speech says why (no table, or we are closed at that time); tell the caller and ask whether another day or time would suit them.",
    input_schema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "The booking date as 'YYYY-MM-DD', worked out from today's date and the coming days listed in the RESTAURANT STATUS. Never guess a date.",
        },
        time: {
          type: "string",
          description: "The booking time as 24-hour 'HH:MM' in Manchester time, e.g. '19:30'. A caller saying 'seven' for dinner means '19:00'.",
        },
        party_size: { type: "integer", minimum: 1, maximum: 8, description: "How many people the table is for." },
      },
      required: ["date", "time", "party_size"],
      additionalProperties: false,
    },
  },
  {
    name: "create_booking",
    description:
      "Reserve the table. Call this ONLY when ALL of these are true: (1) check_availability has said available for this exact date, time and party size, (2) the caller has told you their name, (3) the caller has told you their phone number and said yes to your read-back of it, and (4) you have read back the date, time, number of people, name and phone number, and the caller has said a clear yes to 'Is that all correct, shall I confirm the booking?'. A yes to anything else, such as the phone number read-back, is NOT confirmation, and neither is silence or 'hmm'. Never call it with placeholder, guessed or empty values such as 'Unknown' or '0'. Never call it twice in one call, even if the caller later corrects a detail. Returns 'booking_reference', 'table_number' and a 'speech' sentence that reads back the stored details. If 'success' is false, nothing was booked and 'speech' says why (no table free, or we are closed at that time); tell the caller and ask whether another day or time would suit them.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "The booking date as 'YYYY-MM-DD', exactly as checked with check_availability." },
        time: { type: "string", description: "The booking time as 24-hour 'HH:MM', exactly as checked with check_availability." },
        party_size: { type: "integer", minimum: 1, maximum: 8, description: "How many people, exactly as checked." },
        customer_name: { type: "string", description: "The name the caller told you. Never a placeholder." },
        customer_phone: { type: "string", description: "Contact number, digits only, copied digit by digit from what the caller confirmed on read-back." },
        menu_preferences: {
          type: "string",
          description: "Optional: only if the caller mentioned food or a special occasion, e.g. 'birthday, one vegetarian'. Omit otherwise.",
        },
      },
      required: ["date", "time", "party_size", "customer_name", "customer_phone"],
      additionalProperties: false,
    },
  },
  {
    name: "request_callback",
    description:
      "Record a callback the caller has AGREED to, so a staff member phones them back. Call this ONLY when ALL of these are true: (1) the caller has said yes to being called back, (2) the caller has told you their name, (3) the caller has told you their phone number, and (4) the caller has said yes to your read-back of that number. If any one is missing, do not call this tool; ask the caller for the missing piece instead. Never call it with placeholder, guessed or empty values such as 'Unknown', 'Caller' or '0'. A topic is never by itself a reason to call it: when the caller mentions allergens, a problem or anything you cannot help with, you SAY the callback offer and wait; this tool only records the callback once the details above are in hand. Returns 'callback_id' and a 'speech' sentence that reads back the number exactly as saved; say it word for word. If the caller says that number is wrong, call this tool again with the corrected number AND the same callback_id, which corrects the saved request instead of creating a second one. Leave callback_id out otherwise.",
    input_schema: {
      type: "object",
      properties: {
        callback_id: {
          type: "string",
          description: "Only when correcting: the callback_id returned by the earlier request_callback call.",
        },
        customer_name: { type: "string", description: "The name the caller told you. Never a placeholder." },
        customer_phone: { type: "string", description: "Number to call back, digits only, exactly as the caller confirmed on read-back." },
        reason: {
          type: "string",
          enum: ["allergen", "problem", "other"],
          description: "'allergen' for any allergy or dietary question, 'problem' if something went wrong, 'other' for anything else.",
        },
        details: {
          type: "string",
          description: "One short line for the staff member, e.g. 'Asked if garlic bread contains nuts'.",
        },
      },
      required: ["customer_name", "customer_phone", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "lookup_order",
    description:
      "Find a PAST order the caller is asking about. Call this ONLY when ALL of these are true: (1) the caller has clearly said they want to talk about an order they already placed, to ask for a refund, ask for a change, or make a complaint, (2) you have asked for and been given the order number, and (3) you have asked for and been given the phone number they ordered with. A caller who mentions a past order in passing while placing a NEW order is not a reason to call it; carry on with the new order unless they clearly want to discuss the old one. Never call it with a guessed, partial or missing order number or phone number. It only looks, and decides nothing. The server needs BOTH to match, and when it finds nothing it gives the same answer whichever one was wrong, so never tell the caller which one it was and never guess which order they mean. Returns 'order' (number, date, items, total, type, status) and a 'speech' sentence. If 'success' is false nothing was found: apologise, ask once more for the details, and if it still fails offer a callback.",
    input_schema: {
      type: "object",
      properties: {
        order_number: { type: "string", description: "The order number exactly as the caller said it, e.g. 'A-1001'." },
        customer_phone: { type: "string", description: "The phone number they ordered with, digits only, exactly as the caller said it." },
      },
      required: ["order_number", "customer_phone"],
      additionalProperties: false,
    },
  },
  {
    name: "create_order_query",
    description:
      "Record a refund request, change request or complaint about a past order, so the restaurant can follow it up. It records only: it never refunds, changes or decides anything. Call this ONLY when BOTH are true: (1) lookup_order has found the order and the caller has agreed it is the one they mean, AND (2) the caller has told you what the problem is. Never call it before the order is found, never with an empty or made-up description, and never twice for the same problem in one call. Use the same order_number and customer_phone you used for lookup_order. 'query_type' is 'refund' if they want money back, 'change' if they want the order altered, otherwise 'complaint'. 'description' is what the caller said, in their own words, short and factual, with no promises or opinions added. Returns 'reference_number' and a 'speech' sentence. If 'success' is false nothing was saved: say its speech and offer a callback.",
    input_schema: {
      type: "object",
      properties: {
        order_number: { type: "string", description: "The same order number used for lookup_order." },
        customer_phone: { type: "string", description: "The same phone number used for lookup_order, digits only." },
        query_type: {
          type: "string",
          enum: ["refund", "change", "complaint"],
          description: "'refund' = wants money back. 'change' = wants the order altered. 'complaint' = anything else that went wrong.",
        },
        description: {
          type: "string",
          description: "What the caller said went wrong, in their own words, e.g. 'Pizza arrived cold and the base was soggy'.",
        },
      },
      required: ["order_number", "customer_phone", "query_type", "description"],
      additionalProperties: false,
    },
  },
] as const;

export type ToolName = (typeof TOOLS)[number]["name"];
