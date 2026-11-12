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

// ---------------------------------------------------------------------------
// Digits read back to the caller. These always speak the value AS STORED, so a
// copying mistake by the agent is heard by the caller and can be corrected.

const DIGIT_WORDS = ["oh", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** "07700 900-123" -> "07700900123". Keeps a leading "+" for international numbers. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return raw.trim().startsWith("+") ? `+${digits}` : digits;
}

/** "900" -> "nine-double-oh", "4444" -> "double-four-double-four". */
function digitGroupForSpeech(group: string): string {
  const words: string[] = [];
  let i = 0;
  while (i < group.length) {
    let run = 1;
    while (i + run < group.length && group[i + run] === group[i] && run < 3) run++;
    const w = DIGIT_WORDS[Number(group[i])];
    words.push(run === 3 ? `triple-${w}` : run === 2 ? `double-${w}` : w);
    i += run;
  }
  return words.join("-");
}

/**
 * Phone number in spoken digit groups.
 * "07700900456" -> "oh-double-seven, double-oh, nine-double-oh, four-five-six"
 * UK 11-digit numbers are grouped 3-2-3-3; anything else in threes.
 */
export function phoneForSpeech(phone: string): string {
  const plus = phone.trim().startsWith("+");
  const digits = phone.replace(/\D/g, "");
  let sizes: number[];
  if (!plus && digits.length === 11) {
    sizes = [3, 2, 3, 3];
  } else {
    sizes = Array(Math.floor(digits.length / 3)).fill(3);
    const rest = digits.length % 3;
    if (rest === 1 && sizes.length > 0) sizes[sizes.length - 1] = 4;
    else if (rest > 0) sizes.push(rest);
  }
  const groups: string[] = [];
  let pos = 0;
  for (const size of sizes) {
    groups.push(digitGroupForSpeech(digits.slice(pos, pos + size)));
    pos += size;
  }
  return `${plus ? "plus " : ""}${groups.join(", ")}`;
}

/** "m145tp" -> "M14 5TP". Leaves anything that isn't postcode-shaped uppercased as-is. */
export function formatPostcode(raw: string): string {
  const pc = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{2,4}\d[A-Z]{2}$/.test(pc) ? `${pc.slice(0, -3)} ${pc.slice(-3)}` : raw.trim().toUpperCase();
}

/** "M14 5TP" -> "M-one-four, five-T-P". Letters stay letters, digits become words. */
export function postcodeForSpeech(postcode: string): string {
  return formatPostcode(postcode)
    .split(/\s+/)
    .map((part) =>
      [...part].map((ch) => (/\d/.test(ch) ? DIGIT_WORDS[Number(ch)] : ch)).join("-"),
    )
    .join(", ");
}

/** 7.9 -> "7.90". No currency symbol. */
export function priceForSpeech(price: number | string): string {
  return Number(price).toFixed(2);
}
