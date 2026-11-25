// B4d: the one-click WhatsApp "thank you + Google review" message.
// Pure functions only (no database, no secrets), so the Settings preview in the
// browser, the server routes and the tests all share them.
//
// Nothing is sent automatically: the app only builds a wa.me link. Staff open it
// in WhatsApp Web/Desktop, where the message is already typed, and press Send.
// The same message goes to every customer (no "only ask happy customers" logic:
// review gating is against Google's policy).

/** The placeholders a template may use. Anything else in {braces} is removed. */
export const THANKYOU_PLACEHOLDERS = ["customer_name", "restaurant", "order_no", "total", "review_link"] as const;
export type ThankYouVars = Partial<Record<(typeof THANKYOU_PLACEHOLDERS)[number], string | null | undefined>>;

export const THANKYOU_TEMPLATE_MAX = 600;
export const REVIEW_URL_MAX = 300;

/** Used when the owner has not written their own message (or reset it). */
export const DEFAULT_THANKYOU_TEMPLATE = [
  "Assalam o alaikum {customer_name}! {restaurant} aane ka bohat shukriya.",
  "Aap ka order {order_no}, total {total}.",
  "Apna tajurba 1 se 5 stars mein yahan batayen (sirf 30 second): {review_link}",
  "Dobara tashreef layen!",
  "⭐⭐⭐⭐⭐",
].join("\n");

/** Hosts a Google review link may point to (www. in front is also fine). */
export const REVIEW_HOSTS = ["g.page", "google.com", "maps.app.goo.gl", "goo.gl", "share.google", "search.google.com"] as const;

/** True for an https link on one of REVIEW_HOSTS, with no login part and no custom port. */
export function isAllowedReviewUrl(value: string): boolean {
  if (value.length > REVIEW_URL_MAX || /\s/.test(value)) return false;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  return (REVIEW_HOSTS as readonly string[]).includes(host);
}

/**
 * A Pakistani mobile number in one form: "+923001234567".
 * Accepts 03xx..., +92..., 0092..., 92... and 3xx... (10 digits), with spaces,
 * dashes, dots or brackets. Anything else (landlines, other countries, too short
 * or too long, letters) is null.
 */
export function normalizePkPhone(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw || !/^[+0-9\s\-().]+$/.test(raw)) return null;
  if (raw.indexOf("+") > 0 || (raw.match(/\+/g)?.length ?? 0) > 1) return null;
  const digits = raw.replace(/\D/g, "");
  let national: string;
  if (raw.startsWith("+")) {
    if (!digits.startsWith("92")) return null;
    national = digits.slice(2);
  } else if (digits.startsWith("0092")) national = digits.slice(4);
  else if (digits.startsWith("92") && digits.length === 12) national = digits.slice(2);
  else if (digits.startsWith("03")) national = digits.slice(1);
  else if (digits.startsWith("3") && digits.length === 10) national = digits;
  else return null;
  // Mobile numbers: 3 then 9 more digits (300 123 4567).
  return /^3\d{9}$/.test(national) ? `+92${national}` : null;
}

const PLACEHOLDER = /\{([a-z_]+)\}/g;

/**
 * Fills the template. A placeholder with no value (or one we do not know) is
 * removed cleanly; with no review link, every line that mentions {review_link}
 * is dropped. Blank template = the default one. Result: plain text (no HTML).
 */
export function buildThankYouMessage(template: string | null | undefined, vars: ThankYouVars): string {
  const source = template && template.trim() ? template : DEFAULT_THANKYOU_TEMPLATE;
  const value = (name: string): string => {
    if (!(THANKYOU_PLACEHOLDERS as readonly string[]).includes(name)) return "";
    const v = vars[name as keyof ThankYouVars];
    return typeof v === "string" ? v.trim() : "";
  };
  const hasReview = value("review_link") !== "";

  const lines: string[] = [];
  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    if (!hasReview && line.includes("{review_link}")) continue;
    const hadPlaceholder = PLACEHOLDER.test(line);
    PLACEHOLDER.lastIndex = 0;
    let out = line.replace(PLACEHOLDER, (_m, name: string) => value(name));
    if (hadPlaceholder) {
      out = out
        .replace(/[ \t]{2,}/g, " ")
        .replace(/[ \t]+([!,.?:;])/g, "$1")
        .replace(/([,:;])(?=[!.?])/g, "")
        .replace(/^[ \t]*[,:;][ \t]*/, "")
        .trim();
      // A line that was only placeholders (and punctuation) and is now empty goes.
      if (!/[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(out)) continue;
    }
    lines.push(out.replace(/[ \t]+$/, ""));
  }
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Digits only, as wa.me wants them ("+923001234567" -> "923001234567"). */
const waDigits = (phone: string | null | undefined) => (phone ? phone.replace(/\D/g, "") : "");

/**
 * The wa.me link. With a phone it opens that chat; without one WhatsApp asks
 * staff to pick the contact. The text is fully encoded (Urdu, emoji, & # ? and new lines).
 */
export function buildWaLink(phone: string | null | undefined, text: string): string {
  const digits = waDigits(phone);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
