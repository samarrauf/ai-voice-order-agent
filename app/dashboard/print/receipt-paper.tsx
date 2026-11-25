import type { ReceiptModel } from "@/lib/receipt";

// The customer receipt on paper. Used by the full bill and, once per guest, by
// the split bills (B4c): `partOf` adds the "Part of Order ... · Guest 2 of 3"
// line and `shareOnly` replaces the item list for an amounts split.
export function ReceiptPaper({
  r,
  a4,
  partOf,
  shareOnly,
}: {
  r: ReceiptModel;
  a4: boolean;
  partOf?: string;
  shareOnly?: boolean;
}) {
  return (
    <article
      className={`paper ${a4 ? "paper-a4" : "paper-80"}`}
      style={
        {
          "--brand-primary": r.brand.primary,
          "--brand-accent": r.brand.accent,
          "--brand-on-primary": r.brand.onPrimary,
        } as React.CSSProperties
      }
    >
      {/* a div, not <header>: print.css hides every <header> (the dashboard's own) on print pages */}
      <div className="brand-head">
        {r.brand.logoUrl ? (
          <span className="brand-pill">
            {/* eslint-disable-next-line @next/next/no-img-element -- print page: plain img so the logo is loaded before the print dialog */}
            <img className="brand-logo" src={r.brand.logoUrl} alt={r.restaurantName} />
          </span>
        ) : (
          <div className="brand-name">{r.restaurantName}</div>
        )}
        {r.tagline && <div className="brand-tagline">{r.tagline}</div>}
      </div>
      <div className="center brand-address">
        {r.address && <div>{r.address}</div>}
        {r.phone && <div>Tel: {r.phone}</div>}
      </div>

      {partOf && <div className="split-part">{partOf}</div>}

      <hr className="rule" />
      <div className="meta"><span>Order</span><strong>{r.orderNumber}</strong></div>
      <div className="meta"><span>Date</span><span>{r.placedAt}</span></div>
      <div className="meta"><span>Type</span><span>{r.kindLabel}</span></div>
      {r.table && <div className="meta"><span>Table</span><strong>{r.table}</strong></div>}
      {r.delivery && (
        <div style={{ marginTop: 4 }}>
          {r.delivery.name && <div>{r.delivery.name}</div>}
          {r.delivery.phone && <div>{r.delivery.phone}</div>}
          {r.delivery.address && <div>{r.delivery.address}</div>}
        </div>
      )}

      <hr className="rule" />
      {shareOnly ? (
        <div className="detail">Share of the bill (split by amount)</div>
      ) : (
        r.lines.map((l, i) => (
          <div className="item" key={i}>
            <span>{l.quantity}x</span>
            <span>
              {l.name}
              {l.detail.length > 0 && <div className="detail">{l.detail.join(", ")}</div>}
            </span>
            <span>{l.lineTotal}</span>
          </div>
        ))
      )}
      {!partOf && r.notes && <div className="detail">Note: {r.notes}</div>}

      <hr className="rule" />
      {r.rows.map((row) => (
        <div className={`row${row.kind ? ` row-${row.kind}` : ""}`} key={row.label}>
          <span>{row.label}</span>
          <span>{row.value}</span>
        </div>
      ))}

      <hr className="rule" />
      {r.cancelled && <div className="status">ORDER CANCELLED</div>}
      <div className={`status status-${r.paymentStatus}`}>{r.paymentStatusLabel}</div>
      {r.payments.map((p, i) => (
        <div className="row" key={i}>
          <span>{p.label}</span>
          <span>{p.amount}</span>
        </div>
      ))}
      <div className="row"><strong>Paid</strong><strong>{r.paid}</strong></div>
      <div className="row"><strong>Balance due</strong><strong>{r.balanceDue}</strong></div>

      <hr className="rule" />
      <div className="thanks">{r.brand.footerNote ?? "Thank you for your order!"}</div>
      {(r.phone || r.brand.whatsapp || r.brand.website || r.brand.instagram || r.brand.facebook) && (
        <footer className="brand-foot">
          {r.phone && <div>Tel: {r.phone}</div>}
          {r.brand.whatsapp && <div>WhatsApp: {r.brand.whatsapp}</div>}
          {r.brand.website && <div>{r.brand.website}</div>}
          {r.brand.instagram && <div>Instagram: {r.brand.instagram}</div>}
          {r.brand.facebook && <div>Facebook: {r.brand.facebook}</div>}
        </footer>
      )}
    </article>
  );
}
