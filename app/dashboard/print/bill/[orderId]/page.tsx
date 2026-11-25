import type { Metadata } from "next";
import { decodeSplit, SPLIT_ERRORS } from "@/lib/bill-split";
import { buildReceipt } from "@/lib/receipt";
import { buildSplitReceipts } from "@/lib/split-receipt";
import { PrintControls } from "../../print-controls";
import { ThankYouButton } from "../../../thankyou-button";
import { isA4, loadOrderOr404, loadThankYouLink, pageRule } from "../../load";
import { ReceiptPaper } from "../../receipt-paper";

export const metadata: Metadata = { title: "Print bill", robots: { index: false } };

// Customer receipt. Opens the print dialog by itself. 80mm thermal paper by
// default; add ?size=a4 for an A4 page.
// B4c: ?split=<code> (lib/bill-split.ts encodeSplit) prints one receipt per guest,
// each on its own page/cut, worked out again here from the saved order.
export default async function PrintBillPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ size?: string | string[]; split?: string | string[] }>;
}) {
  const [{ orderId }, { size, split }] = await Promise.all([params, searchParams]);
  const a4 = isA4(size);
  const data = await loadOrderOr404(orderId);
  const thanks = await loadThankYouLink(orderId, data.order);

  const splitParam = typeof split === "string" && split ? split : null;
  const query = (a4Next: boolean) => {
    const q = new URLSearchParams();
    if (a4Next) q.set("size", "a4");
    if (splitParam) q.set("split", splitParam);
    const s = q.toString();
    return `/dashboard/print/bill/${orderId}${s ? `?${s}` : ""}`;
  };
  const controls = (
    <PrintControls
      otherSize={{ label: a4 ? "80mm paper" : "A4 paper", href: query(!a4) }}
      extra={thanks && <ThankYouButton print orderId={orderId} href={thanks.url} clicked={thanks.clicked} />}
    />
  );

  if (splitParam) {
    const spec = decodeSplit(splitParam);
    const built = spec ? buildSplitReceipts(data, spec) : null;
    if (!built || !built.ok) {
      const why = built && !built.ok ? SPLIT_ERRORS[built.error] : "this split link is not valid";
      return (
        <article className={`paper ${a4 ? "paper-a4" : "paper-80"}`}>
          <p className="status">Cannot print split bills</p>
          <p className="center">{why}. Open Split bill again from the payment screen.</p>
        </article>
      );
    }
    return (
      <>
        <style>{pageRule(a4)}</style>
        {controls}
        {built.receipts.map((r, i) => (
          <ReceiptPaper key={i} r={r} a4={a4} partOf={r.partOf} shareOnly={r.shareOnly} />
        ))}
      </>
    );
  }

  return (
    <>
      <style>{pageRule(a4)}</style>
      {controls}
      <ReceiptPaper r={buildReceipt(data)} a4={a4} />
    </>
  );
}
