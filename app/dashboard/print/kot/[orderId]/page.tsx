import type { Metadata } from "next";
import { buildKot } from "@/lib/receipt";
import { PrintControls } from "../../print-controls";
import { isA4, loadOrderOr404, pageRule } from "../../load";

export const metadata: Metadata = { title: "Print kitchen ticket", robots: { index: false } };

// Kitchen ticket (KOT): big clear text, NO prices, NO customer address.
export default async function PrintKotPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ size?: string | string[] }>;
}) {
  const [{ orderId }, { size }] = await Promise.all([params, searchParams]);
  const a4 = isA4(size);
  const k = buildKot(await loadOrderOr404(orderId));

  return (
    <>
      <style>{pageRule(a4)}</style>
      <PrintControls
        otherSize={{ label: a4 ? "80mm paper" : "A4 paper", href: `/dashboard/print/kot/${orderId}${a4 ? "" : "?size=a4"}` }}
      />
      <article className={`paper kot ${a4 ? "paper-a4" : "paper-80"}`}>
        <div className="kot-number">{k.orderNumber}</div>
        <div className="kot-kind">{k.kindLabel}</div>
        {k.table && <div className="kot-kind">Table {k.table}</div>}
        <div className="center">{k.placedAt}</div>

        <hr className="rule" />
        {k.lines.map((l, i) => (
          <div className="kot-item" key={i}>
            <span className="kot-qty">{l.quantity}x</span>
            <span>
              {l.name}
              {l.options.map((o, j) => (
                <div className="kot-extra" key={j}>+ {o}</div>
              ))}
              {l.notes && <div className="kot-extra">NOTE: {l.notes}</div>}
            </span>
          </div>
        ))}

        {k.notes && <div className="kot-note">ORDER NOTE: {k.notes}</div>}
      </article>
    </>
  );
}
