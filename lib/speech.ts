// Helpers for building the `speech` strings the voice agent reads aloud.
// Rule: prices are bare numbers ("7.99", never "£7.99") and sizes are words
// ("ten inch", not "10 inch"), because text-to-speech reads symbols and digits badly.

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** 0–99 as words; larger numbers are returned as digits. */
export function numberToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n);
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  return n % 10 === 0 ? tens : `${tens}-${ONES[n % 10]}`;
}

/** "10 inch" -> "ten inch", "2 Litre" -> "two litre". Lowercases for natural reading. */
export function sizeForSpeech(size: string): string {
  return size
    .replace(/\d+/g, (digits) => numberToWords(Number(digits)))
    .toLowerCase();
}

/** 7.9 -> "7.90". No currency symbol. */
export function priceForSpeech(price: number | string): string {
  return Number(price).toFixed(2);
}
