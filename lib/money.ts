// The ONE place money is turned into text for the screen, and the ONE place the
// per-currency facts live (symbol, decimals, the word the phone agent says, and
// the biggest amounts we accept). Components never write a currency sign
// themselves; they call formatMoney with the restaurant's currency code
// (restaurants.currency), so a restaurant in another currency only needs a
// different value in the database.
//
// Amounts everywhere in the code are in the currency's main unit (pounds,
// rupees) with at most 2 decimals; arithmetic is done in the minor unit (pence,
// paisa), which is why the helpers in lib/order-pricing.ts are still called
// pence()/pounds(): they mean "hundredths of the main unit" for EVERY currency.
//
// Not for speech: tool `speech` strings use bare numbers (see lib/speech.ts).

export type CurrencyCode = "GBP" | "EUR" | "USD" | "PKR";

export type CurrencyInfo = {
  symbol: string;
  /** Decimals shown on screen when the amount is a whole number (PKR: none, "Rs 1,250"). Amounts with paisa/pence always show 2. */
  decimals: 0 | 2;
  /** The word the phone agent says after an amount ("pounds", "rupees"). */
  speechWord: string;
  /** Biggest single payment or fixed discount accepted. */
  maxAmount: number;
  /** Biggest delivery fee an owner may save in Settings. */
  maxDeliveryFee: number;
  /** Biggest minimum order an owner may save in Settings. */
  maxMinOrder: number;
};

export const DEFAULT_CURRENCY: CurrencyCode = "GBP";

// GBP's limits are exactly the numbers that used to be written in the schemas
// (100000 / 100 / 1000), so Napoli does not change.
export const CURRENCY_CONFIG: Record<CurrencyCode, CurrencyInfo> = {
  GBP: { symbol: "£", decimals: 2, speechWord: "pounds", maxAmount: 100_000, maxDeliveryFee: 100, maxMinOrder: 1000 },
  EUR: { symbol: "€", decimals: 2, speechWord: "euros", maxAmount: 100_000, maxDeliveryFee: 100, maxMinOrder: 1000 },
  USD: { symbol: "$", decimals: 2, speechWord: "dollars", maxAmount: 100_000, maxDeliveryFee: 100, maxMinOrder: 1000 },
  PKR: { symbol: "Rs", decimals: 0, speechWord: "rupees", maxAmount: 10_000_000, maxDeliveryFee: 10_000, maxMinOrder: 100_000 },
};

export const isCurrencyCode = (code: unknown): code is CurrencyCode =>
  typeof code === "string" && Object.prototype.hasOwnProperty.call(CURRENCY_CONFIG, code);

/** The config for a currency code; an unknown or missing code uses the default's. */
export const currencyConfig = (code?: string | null): CurrencyInfo =>
  CURRENCY_CONFIG[isCurrencyCode(code) ? code : DEFAULT_CURRENCY];

export const maxAmountFor = (code?: string | null) => currencyConfig(code).maxAmount;
export const maxDeliveryFeeFor = (code?: string | null) => currencyConfig(code).maxDeliveryFee;
export const maxMinOrderFor = (code?: string | null) => currencyConfig(code).maxMinOrder;
export const speechWordFor = (code?: string | null) => currencyConfig(code).speechWord;

/** The biggest payment/discount over all currencies: the ceiling a request schema can check before the restaurant is known. The restaurant's own currency limit is checked right after. */
export const MAX_AMOUNT_ANY_CURRENCY = Math.max(...Object.values(CURRENCY_CONFIG).map((c) => c.maxAmount));

const formatters = new Map<string, Intl.NumberFormat>();

/** Whole-number currencies (PKR): "Rs 1,250", "Rs 1,250.50", "-Rs 0.12". */
function formatWholeUnits(amount: number, info: CurrencyInfo): string {
  const abs = Math.round(Math.abs(amount) * 100) / 100;
  const body = Number.isInteger(abs)
    ? abs.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount < 0 && abs !== 0 ? "-" : ""}${info.symbol} ${body}`;
}

/** formatMoney(8.5) -> "£8.50"; formatMoney(8.5, "EUR") -> "€8.50"; formatMoney(1250, "PKR") -> "Rs 1,250". */
export function formatMoney(amount: number, currency: string = DEFAULT_CURRENCY): string {
  if (isCurrencyCode(currency) && CURRENCY_CONFIG[currency].decimals === 0) {
    return formatWholeUnits(amount, CURRENCY_CONFIG[currency]);
  }
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
