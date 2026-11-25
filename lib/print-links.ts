// Links to the two print pages for an order. Kept in one place so the Orders
// board and the POS always point at the same addresses.
export const printBillHref = (orderId: string) => `/dashboard/print/bill/${encodeURIComponent(orderId)}`;
export const printKotHref = (orderId: string) => `/dashboard/print/kot/${encodeURIComponent(orderId)}`;
/** Kitchen ticket with ONLY the items of one addition (order_events id of an items_added event), headed ADDITION. */
export const printKotAdditionHref = (orderId: string, eventId: string) =>
  `${printKotHref(orderId)}?addition=${encodeURIComponent(eventId)}`;
/** B4c: one receipt per guest of a split bill. `code` = encodeSplit(spec) from lib/bill-split.ts. */
export const printSplitBillsHref = (orderId: string, code: string) =>
  `${printBillHref(orderId)}?split=${encodeURIComponent(code)}`;
