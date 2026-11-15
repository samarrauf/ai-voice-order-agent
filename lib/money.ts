// The ONE place money is turned into text for the screen. Components never
// write a currency sign themselves; they call formatMoney with the restaurant's
// currency code (restaurants.currency, e.g. "GBP" or "EUR"), so a restaurant
// with another currency only needs a different value in the database.
//
// Not for speech: tool `speech` strings use bare numbers (see lib/speech.ts).

export const DEFAULT_CURRENCY = "GBP";

const formatters = new Map<string, Intl.NumberFormat>();

/** formatMoney(8.5) -> "£8.50"; formatMoney(8.5, "EUR") -> "€8.50". */
export function formatMoney(amount: number, currency: string = DEFAULT_CURRENCY): string {
  let f = formatters.get(currency);
  if (!f) {
    try {
      f = new Intl.NumberFormat("en-GB", { style: "currency", currency });
    } catch {
      // An unknown currency code in the database must never crash a page.
      f = new Intl.NumberFormat("en-GB", { style: "currency", currency: DEFAULT_CURRENCY });
    }
    formatters.set(currency, f);
  }
  return f.format(amount);
}
