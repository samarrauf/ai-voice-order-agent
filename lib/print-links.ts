// Links to the two print pages for an order. Kept in one place so the Orders
// board and the POS always point at the same addresses.
export const printBillHref = (orderId: string) => `/dashboard/print/bill/${encodeURIComponent(orderId)}`;
export const printKotHref = (orderId: string) => `/dashboard/print/kot/${encodeURIComponent(orderId)}`;
