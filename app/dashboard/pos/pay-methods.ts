// The payment methods the POS offers (order_payments.method). Shared by the
// payment dialog and the split bill screen.
export const METHODS = [
  { key: "cash", label: "Cash" },
  { key: "card", label: "Card" },
  { key: "online", label: "Online" },
  { key: "other", label: "Other" },
] as const;
export type Method = (typeof METHODS)[number]["key"];

export const FIELD =
  "min-h-11 w-full rounded-xl border border-line bg-raised px-3 text-sm text-ink placeholder:text-ink-faint transition-colors duration-200 hover:border-line-strong";
