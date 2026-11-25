import "server-only";
import { formatMoney } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildThankYouMessage, buildWaLink, isAllowedReviewUrl, normalizePkPhone } from "@/lib/whatsapp-link";

// B4d: the WhatsApp thank-you message for ONE order, built on the server from the
// database (never from the browser). Only logged-in staff routes/pages call this:
// the customer's phone and the review link never go to a public or agent response.
// The restaurant id always comes from the staff session.

export type ThankYouSettings = {
  name: string;
  currency: string;
  /** Checked again here: a value that is not an allowed Google link counts as none. */
  reviewUrl: string | null;
  template: string | null;
};

export type ThankYouOrder = {
  order_number: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  total?: number | string | null;
  status?: string | null;
};

export type ThankYou = {
  /** The message text (plain). */
  text: string;
  /** The customer's number as wa.me wants it, or null (staff pick the contact in WhatsApp). */
  phone: string | null;
  url: string;
  hasReviewLink: boolean;
};

/** Statuses where the button is not offered (and the API refuses). */
export const NO_THANKYOU_STATUSES = ["cancelled", "merged"] as const;
export const thankYouAllowed = (status: string | null | undefined) =>
  !(NO_THANKYOU_STATUSES as readonly string[]).includes(status ?? "");

/** Restaurant name/currency + the private review link and template. One call per page/request. */
export async function loadThankYouSettings(restaurantId: string): Promise<ThankYouSettings | null> {
  const [r, m] = await Promise.all([
    supabaseAdmin.from("restaurants").select("name, currency").eq("id", restaurantId).maybeSingle(),
    supabaseAdmin
      .from("restaurant_messages")
      .select("google_review_url, thankyou_template")
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
  ]);
  if (r.error || !r.data) return null;
  if (m.error) console.error("thankyou: could not read restaurant_messages", m.error);
  const url = m.data?.google_review_url ?? null;
  return {
    name: r.data.name,
    currency: r.data.currency,
    reviewUrl: url && isAllowedReviewUrl(url) ? url : null,
    template: m.data?.thankyou_template ?? null,
  };
}

/** The message, phone and wa.me link for one order (pure given its inputs). */
export function thankYouFor(order: ThankYouOrder, s: ThankYouSettings): ThankYou {
  const text = buildThankYouMessage(s.template, {
    customer_name: order.customer_name,
    restaurant: s.name,
    order_no: order.order_number,
    total: formatMoney(Number(order.total ?? 0), s.currency),
    review_link: s.reviewUrl,
  });
  const phone = normalizePkPhone(order.customer_phone);
  return { text, phone, url: buildWaLink(phone, text), hasReviewLink: s.reviewUrl !== null };
}
