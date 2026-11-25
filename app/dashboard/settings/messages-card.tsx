"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Card, CardHeader } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import {
  DEFAULT_THANKYOU_TEMPLATE,
  THANKYOU_PLACEHOLDERS,
  THANKYOU_TEMPLATE_MAX,
  buildThankYouMessage,
  isAllowedReviewUrl,
} from "@/lib/whatsapp-link";

// B4d: the Google review link and the WhatsApp thank-you message (owner only,
// like the rest of Settings). The server checks both again (lib/settings.ts and
// the database). The preview is plain text in a <pre>, so nothing in the
// template is ever read as HTML.

const input =
  "min-h-11 w-full rounded-xl border border-line bg-raised px-3 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong";

export function MessagesCard({
  restaurantName,
  currency,
  initialReviewUrl,
  initialTemplate,
}: {
  restaurantName: string;
  currency: string;
  initialReviewUrl: string | null;
  initialTemplate: string | null;
}) {
  const router = useRouter();
  const [reviewUrl, setReviewUrl] = useState(initialReviewUrl ?? "");
  const [template, setTemplate] = useState(initialTemplate?.trim() ? initialTemplate : DEFAULT_THANKYOU_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const urlProblem = reviewUrl.trim() !== "" && !isAllowedReviewUrl(reviewUrl.trim());
  const tooLong = template.length > THANKYOU_TEMPLATE_MAX;

  const preview = useMemo(
    () =>
      buildThankYouMessage(template, {
        customer_name: "Ali",
        restaurant: restaurantName,
        order_no: "N-1042",
        total: formatMoney(24.5, currency),
        review_link: isAllowedReviewUrl(reviewUrl.trim()) ? reviewUrl.trim() : null,
      }),
    [template, reviewUrl, restaurantName, currency],
  );

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/staff/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          section: "messages",
          values: {
            google_review_url: reviewUrl.trim() || null,
            // The default text is saved as "no custom template" (null), so later default changes reach it.
            thankyou_template: template.trim() === DEFAULT_THANKYOU_TEMPLATE ? null : template,
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage({ ok: true, text: json.changed?.length ? "Saved." : "Nothing to change." });
        router.refresh();
      } else {
        setMessage({ ok: false, text: json.details?.join(" · ") ?? json.error ?? "Could not save." });
      }
    } catch {
      setMessage({ ok: false, text: "No connection. Try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-4">
      <CardHeader title="WhatsApp shukriya + Google review" hint="Bill ke baad ek click: WhatsApp mein paigham pehle se likha hua" />
      <div className="grid gap-4">
        <label>
          <span className="mb-1 block text-xs font-medium text-ink-muted">Google review link</span>
          <input
            className={input}
            value={reviewUrl}
            onChange={(e) => setReviewUrl(e.target.value)}
            placeholder="https://g.page/r/.../review"
            inputMode="url"
            maxLength={300}
            aria-invalid={urlProblem}
          />
          <span className={urlProblem ? "mt-1 block text-xs text-red-400" : "mt-1 block text-xs text-ink-faint"}>
            {urlProblem
              ? "Sirf https link, aur g.page, google.com, maps.app.goo.gl, goo.gl, share.google ya search.google.com ka."
              : "Google Business Profile mein \"Ask for reviews\" wala link. Khali ho to paigham se review wali line hat jayegi."}
          </span>
        </label>

        <label>
          <span className="mb-1 flex items-baseline justify-between text-xs font-medium text-ink-muted">
            <span>Shukriya paigham</span>
            <span className={tooLong ? "text-red-400" : "text-ink-faint"}>
              {template.length}/{THANKYOU_TEMPLATE_MAX}
            </span>
          </span>
          <textarea className={`${input} py-2`} rows={6} value={template} onChange={(e) => setTemplate(e.target.value)} />
          <span className="mt-1 block text-xs text-ink-faint">
            Placeholders: {THANKYOU_PLACEHOLDERS.map((p) => `{${p}}`).join(" ")}. Jo khali ho, paigham se hat jata hai.
          </span>
        </label>

        <div>
          <span className="mb-1 block text-xs font-medium text-ink-muted">Preview (namoona order N-1042, customer Ali)</span>
          <pre className="whitespace-pre-wrap rounded-xl border border-line bg-raised p-3 font-sans text-sm text-ink">{preview}</pre>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={save} disabled={saving || urlProblem || tooLong}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button onClick={() => setTemplate(DEFAULT_THANKYOU_TEMPLATE)} disabled={saving}>
          Default par wapas
        </Button>
        {message && (
          <span role="status" className={message.ok ? "text-sm text-brand-ink" : "text-sm text-red-400"}>
            {message.text}
          </span>
        )}
      </div>
    </Card>
  );
}
