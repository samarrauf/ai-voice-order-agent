// Links to the two print pages for an order. Kept in one place so the Orders
// board and the POS always point at the same addresses.
export const printBillHref = (orderId: string) => `/dashboard/print/bill/${encodeURIComponent(orderId)}`;
export const printKotHref = (orderId: string) => `/dashboard/print/kot/${encodeURIComponent(orderId)}`;
/** Kitchen ticket with ONLY the items of one addition (order_events id of an items_added event), headed ADDITION. */
export const printKotAdditionHref = (orderId: string, eventId: string) =>
  `${printKotHref(orderId)}?addition=${encodeURIComponent(eventId)}`;
