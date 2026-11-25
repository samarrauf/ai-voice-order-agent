"use client";

import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/components/ui";

// B4d: "WhatsApp: shukriya + rating". A real link (target=_blank, noopener), so
// the browser never blocks it as a popup. WhatsApp Web/Desktop opens with the
// message already typed; staff press Send there. Nothing is sent by the app.
// On click the server notes 'thankyou_clicked' in order_events.

const BTN =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-raised px-4 text-sm font-semibold text-ink transition-colors duration-200 hover:border-line-strong";

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/staff/thankyou", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
}

export function ThankYouButton({
  orderId,
  href,
  clicked: clickedBefore = false,
  className,
  disabled = false,
  print = false,
}: {
  /** Print page toolbar: use its own .print-btn look (dashboard colours are not there). */
  print?: boolean;
  orderId: string;
  /** The wa.me link the server built for this order. */
  href: string;
  /** True when someone already pressed it for this order. */
  clicked?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const [clicked, setClicked] = useState(clickedBefore);
  if (disabled) {
    return (
      <span className={cn(BTN, "cursor-not-allowed opacity-50", className)} aria-disabled="true">
        <MessageCircle className="size-4" aria-hidden /> WhatsApp: shukriya + rating
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={print ? cn("print-btn", className) : cn(BTN, className)}
      onClick={() => {
        setClicked(true);
        void post({ action: "clicked", order_id: orderId }).catch(() => {});
      }}
    >
      {!print && <MessageCircle className="size-4" aria-hidden />}
      WhatsApp: shukriya + rating
      {clicked && <span className={print ? undefined : "text-xs font-medium text-ink-faint"}> · Click ho gaya ✓</span>}
    </a>
  );
}

/**
 * Payment panel (after the bill is fully paid): optional customer phone + the button.
 * The message comes from the server; a new phone is saved on the order (normalised)
 * and the link is rebuilt by the server.
 */
export function ThankYouPanel({ orderId }: { orderId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [savedPhone, setSavedPhone] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [hasReview, setHasReview] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    post({ action: "message", order_id: orderId })
      .then(({ ok, json }) => {
        if (!live) return;
        if (ok && json?.success) {
          setUrl(json.url);
          setSavedPhone(json.customer_phone);
          setPhone(json.customer_phone ?? "");
          setHasReview(json.has_review_link);
        } else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [orderId]);

  async function savePhone() {
    const typed = phone.trim();
    if (!typed || typed === savedPhone || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const { ok, json } = await post({ action: "set_phone", order_id: orderId, customer_phone: typed });
      if (ok && json?.success) {
        setUrl(json.url);
        setSavedPhone(json.customer_phone);
        setPhone(json.customer_phone ?? "");
        setNote({ ok: true, text: "Number save ho gaya." });
      } else {
        setNote({ ok: false, text: "Number theek nahi (misaal: 0300 1234567)." });
      }
    } catch {
      setNote({ ok: false, text: "Connection nahi. Dobara koshish karein." });
    } finally {
      setBusy(false);
    }
  }

  if (failed) return null;
  const pending = phone.trim() !== "" && phone.trim() !== savedPhone;

  return (
    <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-muted">Customer phone (optional)</span>
        <span className="flex gap-2">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={savePhone}
            onKeyDown={(e) => e.key === "Enter" && savePhone()}
            inputMode="tel"
            maxLength={30}
            placeholder="0300 1234567"
            className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-faint"
          />
        </span>
      </label>
      {note && <p className={note.ok ? "text-xs text-brand-ink" : "text-xs text-red-400"}>{note.text}</p>}
      <ThankYouButton orderId={orderId} href={url ?? "#"} disabled={!url || busy || pending} className="w-full" />
      {pending && !busy && <p className="text-xs text-ink-faint">Pehle number save karein (Enter dabayein).</p>}
      {!hasReview && <p className="text-xs text-ink-faint">Google review link Settings mein khali hai: paigham bina review line ke jayega.</p>}
    </div>
  );
}
