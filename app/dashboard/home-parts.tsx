import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { Armchair, BellRing, ChefHat, CircleDollarSign, Coins, Inbox, ShoppingBag } from "lucide-react";
import { CapsuleBars, Donut, Gauge, Sparkline } from "@/components/charts";
import { CountUp, EmptyState, GlassCard, KpiCard, StatusBadge, cn } from "@/components/ui";
import type { HomeData, LiveOrder } from "@/lib/dashboard-home";
import { ORDER_TYPE_LABELS, RANGE_KEYS, RANGE_LABELS, RANGE_VERSUS, STATUS_PROGRESS, penceToAmount, timeAgo, type RangeKey, type SalesReport } from "@/lib/dashboard-stats";
import { formatMoney } from "@/lib/money";

// The pieces of the Home page (app/dashboard/page.tsx). Server components only;
// the numbers come from lib/dashboard-stats.ts and lib/dashboard-home.ts.
// Each card takes `i` (its number) and rises in after the one before it (.home-rise).

const rise = (i: number) => ({ "--i": i }) as CSSProperties;

/** The 7 days / today / this month pills: plain links (?range=...), so no JavaScript is needed. */
export function RangePills({ value }: { value: RangeKey }) {
  return (
    <nav aria-label="Time range" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {RANGE_KEYS.map((key) => (
        <Link
          key={key}
          href={key === "today" ? "/dashboard" : `/dashboard?range=${key}`}
          aria-current={key === value ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors duration-200",
            key === value ? "border-brand-line bg-brand-tint text-brand-ink" : "border-line bg-raised text-ink-muted hover:border-line-strong hover:text-ink",
          )}
        >
          {RANGE_LABELS[key]}
        </Link>
      ))}
    </nav>
  );
}

/** % badge props for KpiCard: null = no earlier figure, 0 = unchanged. */
function change(percent: number | null, range: RangeKey) {
  const versus = RANGE_VERSUS[range];
  if (percent === null) return { note: `Nothing to compare with ${versus}` };
  if (percent === 0) return { note: `Same as ${versus}` };
  return { delta: { percent: Math.abs(percent), direction: percent > 0 ? ("up" as const) : ("down" as const), versus } };
}

/** The four headline cards. `report` is null for staff: then only the running-orders card shows. */
export function KpiRow({ data, range, start }: { data: HomeData; range: RangeKey; start: number }) {
  const { report, running } = { report: data.reports, running: data.ops.running };
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {report && (
        <>
          <div className="home-rise" style={rise(start)}>
            <KpiCard
              accent
              label="Sales"
              value={formatMoney(penceToAmount(report.current.salesPence), data.currency)}
              figure={<CountUp value={penceToAmount(report.current.salesPence)} currency={data.currency} />}
              icon={<CircleDollarSign size={18} />}
              {...change(report.change.sales, range)}
              className="h-full"
            >
              <Sparkline values={report.series.map((p) => p.salesPence)} ariaLabel="Sales trend" colorIndex={1} width={140} />
            </KpiCard>
          </div>
          <div className="home-rise" style={rise(start + 1)}>
            <KpiCard
              label="Orders"
              value={String(report.current.orders)}
              figure={<CountUp value={report.current.orders} />}
              icon={<ShoppingBag size={18} />}
              tone={2}
              {...change(report.change.orders, range)}
              className="h-full"
            />
          </div>
          <div className="home-rise" style={rise(start + 2)}>
            <KpiCard
              label="Average order"
              value={formatMoney(penceToAmount(report.current.averagePence), data.currency)}
              figure={<CountUp value={penceToAmount(report.current.averagePence)} currency={data.currency} />}
              icon={<Coins size={18} />}
              tone={3}
              {...change(report.change.average, range)}
              className="h-full"
            />
          </div>
        </>
      )}
      <div className="home-rise" style={rise(start + 3)}>
        <KpiCard
          label="Orders in progress"
          value={String(running)}
          figure={<CountUp value={running} />}
          icon={<ChefHat size={18} />}
          tone={4}
          note="New, preparing or ready right now"
          className="h-full"
        />
      </div>
    </div>
  );
}

/** "N orders waiting for confirmation" (links to the orders board) and "X of Y tables seated". */
export function QuickCards({ data, start }: { data: HomeData; start: number }) {
  const { waiting, tables } = data.ops;
  return (
    <>
      <Link href="/dashboard/orders" className="home-rise block rounded-card focus-visible:outline-2" style={rise(start)}>
        <GlassCard lift className="flex h-full items-center gap-4">
          <span aria-hidden className={cn("flex size-12 shrink-0 items-center justify-center rounded-full", waiting > 0 ? "bg-status-new/15 text-status-new" : "bg-raised text-ink-faint")}>
            <BellRing size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-3xl font-extrabold leading-none tabular-nums">
              <CountUp value={waiting} />
            </p>
            <p className="mt-1.5 text-sm text-ink-muted">{waiting === 1 ? "order waiting for confirmation" : waiting === 0 ? "orders waiting. All caught up" : "orders waiting for confirmation"}</p>
          </div>
        </GlassCard>
      </Link>
      {tables && (
        <Link href="/dashboard/tables" className="home-rise block rounded-card focus-visible:outline-2" style={rise(start + 1)}>
          <GlassCard lift className="flex h-full items-center gap-4">
            <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-status-ready/15 text-status-ready">
              <Armchair size={22} />
            </span>
            <div className="min-w-0">
              <p className="text-3xl font-extrabold leading-none tabular-nums">
                <CountUp value={tables.seated} />
                <span className="text-lg font-semibold text-ink-faint"> / {tables.count}</span>
              </p>
              <p className="mt-1.5 text-sm text-ink-muted">tables seated</p>
            </div>
          </GlassCard>
        </Link>
      )}
    </>
  );
}

function CardTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3">
      <h2 className="text-base font-bold tracking-tight">{children}</h2>
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
    </div>
  );
}

const NO_ORDERS = <EmptyState icon={<Inbox size={20} />} title="No orders yet" message="They will show up here as soon as the first order comes in." className="py-8" />;

/** Sales bars: per hour for today, per day for 7 days and the month. */
export function SalesChart({ report, range, currency, i }: { report: SalesReport; range: RangeKey; currency: string; i: number }) {
  const bars = report.series.map((p) => ({ label: p.label, title: p.title, value: p.salesPence, valueLabel: formatMoney(penceToAmount(p.salesPence), currency) }));
  return (
    <GlassCard className="home-rise h-full" style={rise(i)}>
      <CardTitle hint={range === "today" ? "Net of tax, by hour" : "Net of tax, by day"}>{range === "today" ? "Sales by hour" : "Sales by day"}</CardTitle>
      {report.current.orders === 0 ? NO_ORDERS : <CapsuleBars data={bars} labelEvery={bars.length > 20 ? 3 : bars.length > 14 ? 2 : 1} ariaLabel={range === "today" ? "Sales by hour" : "Sales by day"} />}
    </GlassCard>
  );
}

/** Order types as a ring, with the five best sellers under it. */
export function MixCard({ report, i }: { report: SalesReport; i: number }) {
  const top = report.topItems;
  const best = top[0]?.quantity ?? 0;
  return (
    <GlassCard className="home-rise h-full" style={rise(i)}>
      <CardTitle>Order types</CardTitle>
      {report.current.orders === 0 ? (
        NO_ORDERS
      ) : (
        <>
          <Donut
            ariaLabel="Share of dine-in, takeaway and delivery orders"
            slices={report.types.map((t) => ({ label: ORDER_TYPE_LABELS[t.type], value: t.count }))}
            center={
              <>
                <span className="text-2xl font-extrabold leading-none tabular-nums">
                  <CountUp value={report.current.orders} />
                </span>
                <span className="mt-1 text-[11px] text-ink-faint">orders</span>
              </>
            }
          />
          <h3 className="mb-3 mt-6 text-sm font-bold">Top items</h3>
          {top.length === 0 ? (
            <p className="text-xs text-ink-faint">No items sold yet.</p>
          ) : (
            <ol className="grid gap-3">
              {top.map((t, n) => (
                <li key={t.name}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="mr-2 text-ink-faint tabular-nums">{n + 1}</span>
                      {t.name}
                    </span>
                    <span className="font-semibold tabular-nums">{t.quantity}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
                    <div className="h-full rounded-full" style={{ width: `${best ? Math.round((t.quantity / best) * 100) : 0}%`, background: `var(--chart-${(n % 8) + 1})` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </GlassCard>
  );
}

/** How much of everything billed has been paid. */
export function CollectedCard({ report, currency, i }: { report: SalesReport; currency: string; i: number }) {
  const { percent, paidPence, billedPence } = report.collected;
  return (
    <GlassCard className="home-rise h-full" style={rise(i)}>
      <CardTitle>Payments collected</CardTitle>
      {billedPence === 0 ? (
        NO_ORDERS
      ) : (
        <div className="pt-2">
          <Gauge
            percent={percent}
            ariaLabel="Share of the billed total already paid"
            caption={`${formatMoney(penceToAmount(paidPence), currency)} of ${formatMoney(penceToAmount(billedPence), currency)}`}
          />
        </div>
      )}
    </GlassCard>
  );
}

/** The five newest orders. Staff see no amounts (the loader never sends them). */
export function LiveList({ orders, now, currency, i }: { orders: LiveOrder[]; now: Date; currency: string; i: number }) {
  return (
    <GlassCard className="home-rise h-full" style={rise(i)}>
      <CardTitle hint="Newest first">Latest orders</CardTitle>
      {orders.length === 0 ? (
        NO_ORDERS
      ) : (
        <ul className="grid gap-1">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href="/dashboard/orders" className="block rounded-2xl px-2 py-2.5 transition-colors hover:bg-raised">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold tabular-nums">#{o.orderNumber}</p>
                    <p className="text-xs text-ink-faint">
                      {ORDER_TYPE_LABELS[o.type]} · {timeAgo(o.createdAt, now)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge status={o.status} />
                    {o.total !== undefined && <span className="text-xs font-semibold tabular-nums">{formatMoney(o.total, currency)}</span>}
                  </div>
                </div>
                <div aria-hidden className="mt-2 h-1 overflow-hidden rounded-full bg-raised">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${STATUS_PROGRESS[o.status] ?? 0}%` }} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
