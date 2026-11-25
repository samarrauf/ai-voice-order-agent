import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { CircleDollarSign, Coins, Inbox, Landmark, Percent, ReceiptText, ShoppingBag, Tag, TrendingUp, Wallet } from "lucide-react";
import { CapsuleBars, Donut, Sparkline } from "@/components/charts";
import { Badge, Button, CountUp, EmptyState, GlassCard, KpiCard, cn } from "@/components/ui";
import { ORDER_TYPE_LABELS, penceToAmount } from "@/lib/dashboard-stats";
import { formatMoney } from "@/lib/money";
import { PAYMENT_STATUS_LABELS } from "@/lib/order-adjust";
import { REPORT_RANGES, REPORT_RANGE_LABELS, type Report, type ReportPoint, type ReportRange, type ShareRow } from "@/lib/reports";

// Pieces of the Reports page (app/dashboard/reports/page.tsx). Server components only;
// every figure comes from lib/reports.ts. Owner-only parts render only when
// `report.profit` exists (lib/reports-data.ts adds it for view_profit alone).

const rise = (i: number) => ({ "--i": i }) as CSSProperties;
const money = (pence: number, currency: string) => formatMoney(penceToAmount(pence), currency);

function CardTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3">
      <h2 className="text-base font-bold tracking-tight">{children}</h2>
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
    </div>
  );
}

const NO_ORDERS = <EmptyState icon={<Inbox size={20} />} title="No orders in this period" message="Pick another date range to see figures." className="py-8" />;

const pill = (active: boolean) =>
  cn(
    "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors duration-200",
    active ? "border-brand-line bg-brand-tint text-brand-ink" : "border-line bg-raised text-ink-muted hover:border-line-strong hover:text-ink",
  );

/** Range pills (plain links) and the custom dates form (a GET form: works without JavaScript). */
export function RangePicker({ range, fromDate, toDate }: { range: ReportRange; fromDate: string; toDate: string }) {
  const input = "min-h-11 rounded-xl border border-line bg-raised px-3 text-sm text-ink focus:border-line-strong";
  return (
    <div className="grid gap-3">
      <nav aria-label="Date range" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {REPORT_RANGES.filter((k) => k !== "custom").map((key) => (
          <Link key={key} href={key === "today" ? "/dashboard/reports" : `/dashboard/reports?range=${key}`} aria-current={key === range ? "page" : undefined} className={pill(key === range)}>
            {REPORT_RANGE_LABELS[key]}
          </Link>
        ))}
      </nav>
      <form action="/dashboard/reports" method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="range" value="custom" />
        <label className="grid gap-1 text-xs font-medium text-ink-muted">
          From
          <input type="date" name="from" defaultValue={fromDate} required className={input} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-ink-muted">
          To
          <input type="date" name="to" defaultValue={toDate} required className={input} />
        </label>
        <Button type="submit" variant={range === "custom" ? "primary" : "secondary"}>
          Show dates
        </Button>
      </form>
    </div>
  );
}

/** % badge props for KpiCard: null = nothing to compare with, 0 = unchanged. */
function change(percent: number | null, versus: string) {
  if (percent === null) return { note: `Nothing to compare with ${versus}` };
  if (percent === 0) return { note: `Same as ${versus}` };
  return { delta: { percent: Math.abs(percent), direction: percent > 0 ? ("up" as const) : ("down" as const), versus } };
}

export function KpiGrid({ report, currency }: { report: Report; currency: string }) {
  const { current, change: ch } = report.kpis;
  const versus = report.period.versus;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <div className="home-rise sm:col-span-2 xl:col-span-1" style={rise(1)}>
        <KpiCard
          accent
          label="Sales (without tax)"
          value={money(current.salesPence, currency)}
          figure={<CountUp value={penceToAmount(current.salesPence)} currency={currency} />}
          icon={<CircleDollarSign size={18} />}
          {...change(ch.salesPence, versus)}
          className="h-full"
        >
          <Sparkline values={report.daily.map((p) => p.salesPence)} ariaLabel="Sales trend" colorIndex={1} width={140} />
        </KpiCard>
      </div>
      <div className="home-rise" style={rise(2)}>
        <KpiCard label="Orders" value={String(current.orders)} figure={<CountUp value={current.orders} />} icon={<ShoppingBag size={18} />} tone={2} {...change(ch.orders, versus)} className="h-full" />
      </div>
      <div className="home-rise" style={rise(3)}>
        <KpiCard
          label="Average order"
          value={money(current.averagePence, currency)}
          figure={<CountUp value={penceToAmount(current.averagePence)} currency={currency} />}
          icon={<Coins size={18} />}
          tone={3}
          {...change(ch.averagePence, versus)}
          className="h-full"
        />
      </div>
      <div className="home-rise" style={rise(4)}>
        <KpiCard
          label="Tax collected"
          value={money(current.taxPence, currency)}
          figure={<CountUp value={penceToAmount(current.taxPence)} currency={currency} />}
          icon={<Landmark size={18} />}
          tone={4}
          {...change(ch.taxPence, versus)}
          className="h-full"
        />
      </div>
      <div className="home-rise" style={rise(5)}>
        <KpiCard
          label="Discounts given"
          value={money(current.discountPence, currency)}
          figure={<CountUp value={penceToAmount(current.discountPence)} currency={currency} />}
          icon={<Tag size={18} />}
          tone={5}
          {...change(ch.discountPence, versus)}
          className="h-full"
        />
      </div>
    </div>
  );
}

/** OWNER ONLY: rendered only when report.profit exists. */
export function ProfitGrid({ report, currency }: { report: Report; currency: string }) {
  const p = report.profit;
  if (!p) return null;
  return (
    <GlassCard className="home-rise" style={rise(6)}>
      <CardTitle hint="Only you (owner) can see this">Profit</CardTitle>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Gross profit" value={formatMoney(p.grossProfit, currency)} icon={<TrendingUp size={18} />} tone={1} note="Items sold - discounts - item cost" className="h-full" />
        <KpiCard label="Item cost" value={formatMoney(p.itemCost, currency)} icon={<ReceiptText size={18} />} tone={6} note="Cost saved when each order was sold" className="h-full" />
        <KpiCard label="Expenses" value={formatMoney(p.expenses, currency)} icon={<Wallet size={18} />} tone={7} note="From the Expenses page, same dates" className="h-full" />
        <KpiCard
          accent
          label="Net profit"
          value={formatMoney(p.netProfit, currency)}
          icon={<Percent size={18} />}
          {...change(p.change, report.period.versus)}
          className="h-full"
        />
      </div>
      {p.incompleteOrders > 0 && (
        <p role="note" className="mt-4 rounded-xl border border-line bg-raised px-4 py-3 text-sm text-ink-muted">
          Note: {p.incompleteOrders} {p.incompleteOrders === 1 ? "order has" : "orders have"} items without a cost price, so their cost counts as 0 and the
          profit above is higher than the real figure. Set the costs on the{" "}
          <Link href="/dashboard/menu" className="font-semibold text-brand-ink underline">
            Menu
          </Link>{" "}
          page.
        </p>
      )}
    </GlassCard>
  );
}

function bars(points: readonly ReportPoint[], currency: string) {
  return points.map((p) => ({ label: p.label, title: `${p.title} · ${p.orders} ${p.orders === 1 ? "order" : "orders"}`, value: p.salesPence, valueLabel: money(p.salesPence, currency) }));
}

export function HourlyCard({ report, currency, i }: { report: Report; currency: string; i: number }) {
  const data = bars(report.hourly, currency);
  return (
    <GlassCard className="home-rise h-full" style={rise(i)}>
      <CardTitle hint="Without tax, all days in the period added up">Sales by hour</CardTitle>
      {report.kpis.current.orders === 0 ? NO_ORDERS : <CapsuleBars data={data} labelEvery={data.length > 16 ? 2 : 1} ariaLabel="Sales by hour" />}
    </GlassCard>
  );
}

export function DailyCard({ report, currency, i }: { report: Report; currency: string; i: number }) {
  const data = bars(report.daily, currency);
  return (
    <GlassCard className="home-rise h-full" style={rise(i)}>
      <CardTitle hint={`Without tax · day starts ${report.period.dayStart}`}>Sales by day</CardTitle>
      {report.kpis.current.orders === 0 ? (
        NO_ORDERS
      ) : (
        <CapsuleBars data={data} labelEvery={data.length > 60 ? 10 : data.length > 31 ? 5 : data.length > 14 ? 3 : 1} ariaLabel="Sales by day" />
      )}
    </GlassCard>
  );
}

export function TopItemsCard({ report, currency, i }: { report: Report; currency: string; i: number }) {
  const owner = Boolean(report.profit);
  const items = report.topItems;
  return (
    <GlassCard className="home-rise h-full" style={rise(i)}>
      <CardTitle hint="Line totals, before whole-order discounts">Top 10 items</CardTitle>
      {items.length === 0 ? (
        NO_ORDERS
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[20rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-faint">
                <th className="px-1 py-2 font-medium">Item</th>
                <th className="px-1 py-2 text-right font-medium">Sold</th>
                <th className="px-1 py-2 text-right font-medium">Amount</th>
                {owner && <th className="px-1 py-2 text-right font-medium">Profit</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((it, n) => (
                <tr key={it.name}>
                  <td className="px-1 py-2">
                    <span className="mr-2 text-xs text-ink-faint tabular-nums">{n + 1}</span>
                    <span className="font-medium">{it.name}</span>
                  </td>
                  <td className="px-1 py-2 text-right tabular-nums">{it.quantity}</td>
                  <td className="px-1 py-2 text-right tabular-nums">{money(it.amountPence, currency)}</td>
                  {owner && (
                    <td className="px-1 py-2 text-right tabular-nums">
                      {money(it.profitPence ?? 0, currency)}
                      {(it.costMissingLines ?? 0) > 0 && <span className="block text-[11px] text-ink-faint">cost missing on {it.costMissingLines}</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}

function ShareList({ rows, currency, unit }: { rows: readonly { label: string; count: number; pence: number; percent?: number }[]; currency: string; unit: string }) {
  return (
    <ul className="mt-4 divide-y divide-line text-sm">
      {rows.map((r) => (
        <li key={r.label} className="flex items-baseline justify-between gap-3 py-2">
          <span className="min-w-0">
            <span className="font-medium">{r.label}</span>
            <span className="ml-2 text-xs text-ink-faint">
              {r.count} {unit}
              {r.percent !== undefined ? ` · ${r.percent}%` : ""}
            </span>
          </span>
          <span className="shrink-0 tabular-nums">{money(r.pence, currency)}</span>
        </li>
      ))}
    </ul>
  );
}

function ShareCard({ title, hint, rows, report, currency, i, aria }: { title: string; hint: string; rows: readonly ShareRow[]; report: Report; currency: string; i: number; aria: string }) {
  return (
    <GlassCard className="home-rise h-full" style={rise(i)}>
      <CardTitle hint={hint}>{title}</CardTitle>
      {report.kpis.current.orders === 0 ? (
        NO_ORDERS
      ) : (
        <>
          <Donut
            ariaLabel={aria}
            slices={rows.map((r) => ({ label: r.label, value: r.salesPence }))}
            center={
              <>
                <span className="text-2xl font-extrabold leading-none tabular-nums">
                  <CountUp value={report.kpis.current.orders} />
                </span>
                <span className="mt-1 text-[11px] text-ink-faint">orders</span>
              </>
            }
          />
          <ShareList rows={rows.map((r) => ({ label: r.label, count: r.orders, pence: r.salesPence, percent: r.percent }))} currency={currency} unit="orders" />
        </>
      )}
    </GlassCard>
  );
}

export function SourcesCard({ report, currency, i }: { report: Report; currency: string; i: number }) {
  return <ShareCard title="Where orders came from" hint="Sales share, without tax" rows={report.sources} report={report} currency={currency} i={i} aria="Sales by order source" />;
}

export function TypesCard({ report, currency, i }: { report: Report; currency: string; i: number }) {
  return <ShareCard title="Dine-in, takeaway, delivery" hint="Sales share, without tax" rows={report.types} report={report} currency={currency} i={i} aria="Sales by order type" />;
}

export function PaymentsCard({ report, currency, i }: { report: Report; currency: string; i: number }) {
  const rows = report.payments;
  const net = rows.reduce((a, r) => a + r.netPence, 0);
  const any = rows.some((r) => r.payments + r.refunds > 0);
  return (
    <GlassCard className="home-rise h-full" style={rise(i)}>
      <CardTitle hint="Money taken in this period, refunds taken off">By payment method</CardTitle>
      {!any ? (
        <EmptyState icon={<Wallet size={20} />} title="No payments in this period" message="Payments taken on the POS or Tables page show up here." className="py-8" />
      ) : (
        <>
          <Donut
            ariaLabel="Money taken by payment method"
            slices={rows.map((r) => ({ label: r.label, value: Math.max(0, r.netPence) }))}
            center={
              <>
                <span className="text-lg font-extrabold leading-none tabular-nums">{money(net, currency)}</span>
                <span className="mt-1 text-[11px] text-ink-faint">taken</span>
              </>
            }
          />
          <ul className="mt-4 divide-y divide-line text-sm">
            {rows.map((r) => (
              <li key={r.method} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{r.label}</span>
                  <span className="ml-2 text-xs text-ink-faint">
                    {r.payments} {r.payments === 1 ? "payment" : "payments"}
                    {r.refunds > 0 ? ` · ${r.refunds} refunded (${money(r.refundedPence, currency)})` : ""}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{money(r.netPence, currency)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </GlassCard>
  );
}

export function UnpaidCard({ report, currency, timeZone, i }: { report: Report; currency: string; timeZone: string; i: number }) {
  const { count, owedPence, orders } = report.unpaid;
  const when = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return (
    <GlassCard className="home-rise" style={rise(i)}>
      <CardTitle hint={count ? `${count} ${count === 1 ? "order" : "orders"} · ${money(owedPence, currency)} still owed` : undefined}>Unpaid and part-paid orders</CardTitle>
      {count === 0 ? (
        <EmptyState icon={<Wallet size={20} />} title="Nothing owed" message="Every order in this period is fully paid." className="py-8" />
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-faint">
                <th className="px-1 py-2 font-medium">Order</th>
                <th className="px-1 py-2 font-medium">When</th>
                <th className="px-1 py-2 font-medium">Type</th>
                <th className="px-1 py-2 font-medium">Payment</th>
                <th className="px-1 py-2 text-right font-medium">Bill</th>
                <th className="px-1 py-2 text-right font-medium">Owed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-1 py-2">
                    <span className="font-semibold">{o.orderNumber}</span>
                    {o.customerName && <span className="block text-xs text-ink-faint">{o.customerName}</span>}
                  </td>
                  <td className="px-1 py-2 whitespace-nowrap text-ink-muted">{when.format(new Date(o.createdAt))}</td>
                  <td className="px-1 py-2">{ORDER_TYPE_LABELS[o.type]}</td>
                  <td className="px-1 py-2">
                    <Badge tone={o.paymentStatus === "partial" ? "hot" : "danger"}>{PAYMENT_STATUS_LABELS[o.paymentStatus] ?? o.paymentStatus}</Badge>
                  </td>
                  <td className="px-1 py-2 text-right tabular-nums">{money(o.totalPence, currency)}</td>
                  <td className="px-1 py-2 text-right font-semibold tabular-nums">{money(o.owedPence, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {count > orders.length && <p className="mt-2 text-xs text-ink-faint">Showing the oldest {orders.length} of {count}.</p>}
        </div>
      )}
    </GlassCard>
  );
}
