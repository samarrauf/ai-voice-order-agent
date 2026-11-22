// The POS cart: ALL of its data and every way it can change, in one place.
//
// Deliberately plain: the state is simple JSON (no functions, no prices) and
// every change goes through `cartReducer`. That keeps the screen code small,
// and means offline support can be added later by saving/restoring this one
// object, without touching the components.
//
// There are NO prices here on purpose. Prices are never worked out in the
// browser; the screen asks /api/staff/price-preview and shows its answer.

export const MAX_LINE_QTY = 20; // same limit the server enforces (lib/order-pricing.ts)
export const MAX_LINES = 30;

export type OrderType = "dine_in" | "takeaway" | "delivery";
export type DiscountType = "none" | "percent" | "fixed";

export type CartLine = {
  /** Same item + size + options = same key, so adding it again raises the quantity. */
  key: string;
  menuItemId: string;
  name: string;
  sizeName: string | null;
  options: string[];
  quantity: number;
};

export type CartTable = { tableId: string; tableNumber: string; sessionId: string };

export type CartState = {
  orderType: OrderType;
  table: CartTable | null;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryPostcode: string;
  /** area_list restaurants: the delivery area picked from the restaurant's list. */
  deliveryArea: string;
  /** What staff typed for the discount. The server decides if it is allowed and what it comes to. */
  discountType: DiscountType;
  discountValue: string;
  discountReason: string;
  note: string;
  lines: CartLine[];
};

export const emptyCart = (orderType: OrderType = "dine_in"): CartState => ({
  orderType,
  table: null,
  customerName: "",
  customerPhone: "",
  deliveryAddress: "",
  deliveryPostcode: "",
  deliveryArea: "",
  discountType: "none",
  discountValue: "",
  discountReason: "",
  note: "",
  lines: [],
});

export type NewLine = Omit<CartLine, "key">;

export type CartAction =
  | { type: "add"; line: NewLine }
  | { type: "setQuantity"; key: string; quantity: number }
  | { type: "remove"; key: string }
  | { type: "setOrderType"; orderType: OrderType }
  | { type: "setTable"; table: CartTable | null }
  | { type: "setField"; field: "customerName" | "customerPhone" | "deliveryAddress" | "deliveryPostcode" | "deliveryArea" | "discountValue" | "discountReason" | "note"; value: string }
  | { type: "setDiscountType"; discountType: DiscountType }
  | { type: "load"; cart: CartState }
  | { type: "reset" };

const lineKey = (l: NewLine) => [l.menuItemId, l.sizeName ?? "", ...[...l.options].sort()].join("|");

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "add": {
      const key = lineKey(action.line);
      const existing = state.lines.find((l) => l.key === key);
      if (existing) {
        const quantity = Math.min(MAX_LINE_QTY, existing.quantity + action.line.quantity);
        return { ...state, lines: state.lines.map((l) => (l.key === key ? { ...l, quantity } : l)) };
      }
      if (state.lines.length >= MAX_LINES) return state;
      return { ...state, lines: [...state.lines, { ...action.line, key }] };
    }
    case "setQuantity": {
      if (action.quantity < 1) return { ...state, lines: state.lines.filter((l) => l.key !== action.key) };
      const quantity = Math.min(MAX_LINE_QTY, action.quantity);
      return { ...state, lines: state.lines.map((l) => (l.key === action.key ? { ...l, quantity } : l)) };
    }
    case "remove":
      return { ...state, lines: state.lines.filter((l) => l.key !== action.key) };
    case "setOrderType":
      return { ...state, orderType: action.orderType };
    case "setTable":
      return { ...state, table: action.table };
    case "setDiscountType":
      return { ...state, discountType: action.discountType, discountValue: action.discountType === "none" ? "" : state.discountValue };
    case "setField":
      return { ...state, [action.field]: action.value };
    case "load":
      // A held order taken back: the server already re-checked it.
      return action.cart;
    case "reset":
      // After an order is sent: empty everything but stay on the same order type.
      return emptyCart(state.orderType);
  }
}

/** The items exactly as the server wants them (used by both price-preview and manual-order). */
export const toItemsPayload = (lines: CartLine[]) =>
  lines.map((l) => ({ menu_item_id: l.menuItemId, size_name: l.sizeName, quantity: l.quantity, options: l.options }));

/** The discount as the server wants it: only what staff chose, never an amount worked out here. */
export function toDiscountPayload(cart: CartState) {
  const value = Number(cart.discountValue);
  if (cart.discountType === "none" || !(value > 0)) return { type: "none" as const, value: 0, reason: null };
  return { type: cart.discountType, value, reason: cart.discountReason.trim() || null };
}

/** The body for /api/staff/price-preview. */
export function toPreviewPayload(restaurantId: string, cart: CartState) {
  return {
    restaurant_id: restaurantId,
    order_type: cart.orderType,
    delivery_area: cart.orderType === "delivery" ? cart.deliveryArea.trim() || null : null,
    discount: toDiscountPayload(cart),
    items: toItemsPayload(cart.lines),
  };
}

/** The body for /api/staff/manual-order. Note: no prices, only what was chosen. */
export function toOrderPayload(restaurantId: string, cart: CartState) {
  return {
    restaurant_id: restaurantId,
    order_type: cart.orderType,
    table_session_id: cart.orderType === "dine_in" ? (cart.table?.sessionId ?? null) : null,
    customer_name: cart.customerName.trim() || null,
    customer_phone: cart.customerPhone.trim() || null,
    delivery_address: cart.orderType === "delivery" ? cart.deliveryAddress.trim() || null : null,
    delivery_postcode: cart.orderType === "delivery" ? cart.deliveryPostcode.trim() || null : null,
    delivery_area: cart.orderType === "delivery" ? cart.deliveryArea.trim() || null : null,
    discount: toDiscountPayload(cart),
    notes: cart.note.trim() || null,
    items: toItemsPayload(cart.lines),
  };
}

export const itemCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.quantity, 0);
