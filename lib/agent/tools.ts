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
      "Check whether we deliver to a UK postcode, and get the delivery fee and estimated time. Call this as soon as the caller says they want delivery and has given a postcode, before taking more items. Returns 'deliverable', 'fee', 'eta_minutes' and a 'speech' sentence.",
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
      "Price or place the order. All prices are calculated by the server from the menu. First call with preview=true to get the exact total for the read-back (nothing is saved). Only after the caller confirms the read-back, call again with preview=false to place it; that returns the order number. Returns a 'speech' sentence; if the order has a problem (unavailable item, wrong size, below minimum), 'success' is false and 'speech' says what to ask the caller.",
    input_schema: {
      type: "object",
      properties: {
        preview: {
          type: "boolean",
          description: "true = price only, do not place. false = place the order for real. Only use false after the caller has said yes to the read-back.",
        },
        fulfilment_type: { type: "string", enum: ["delivery", "pickup"], description: "'pickup' means collection." },
        customer_name: { type: "string", description: "The caller's name." },
        customer_phone: { type: "string", description: "Contact number, digits only, as confirmed by the caller." },
        delivery_address: { type: "string", description: "First line of the address. Required for delivery." },
        delivery_postcode: { type: "string", description: "Postcode as confirmed by the caller. Required for delivery." },
        payment_method: { type: "string", enum: ["cash", "card_on_delivery"], description: "'card_on_delivery' if they say card." },
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
] as const;

export type ToolName = (typeof TOOLS)[number]["name"];
