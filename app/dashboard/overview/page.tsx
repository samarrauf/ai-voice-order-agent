import { BarChart3, Download, PieChart, RefreshCw, Repeat, ShoppingBag, Tag } from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState, FilterChips, KpiCard, PageHeader } from "@/components/ui";

// Overview: the owner's numbers at a glance. This is the layout only. Every
// card shows its empty state; real figures are wired in during a later phase.

const RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "month", label: "This month" },
  { key: "30d", label: "Last 30 days" },
  { key: "custom", label: "Custom" },
] as const;

const KPIS = ["Orders", "Customers", "Net sales", "Average order", "Delivery share", "Avg prep time"];

export default function OverviewPage() {
  return (
    <div className="anim-rise">
      <PageHeader
        title="Overview"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            Sales, customers and kitchen speed at a glance. <Badge>Coming soon</Badge>
          </span>
        }
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <FilterChips label="Date range" chips={RANGES} value="today" disabled />
        <div className="flex items-center gap-2">
          <span className="mr-1 hidden whitespace-nowrap text-xs text-ink-faint sm:inline">Not updated yet</span>
          <Button disabled>
            <RefreshCw size={16} aria-hidden /> Refresh
          </Button>
          <Button disabled>
            <Download size={16} aria-hidden /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {KPIS.map((label) => (
          <KpiCard key={label} label={label} value="–" />
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Orders by hour" />
          <EmptyState
            className="min-h-56"
            icon={<BarChart3 size={20} />}
            title="No data yet"
            message="Bars appear here as orders come in, so the busy hours stand out."
          />
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Delivery vs pickup" />
          <EmptyState
            className="min-h-56"
            icon={<PieChart size={20} />}
            title="No data yet"
            message="See how orders and sales split between delivery, pickup and dine-in."
          />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title="Top selling items" />
          <EmptyState icon={<ShoppingBag size={20} />} title="No data yet" message="The best sellers are listed here once orders arrive." />
        </Card>
        <Card>
          <CardHeader title="Deal performance" />
          <EmptyState icon={<Tag size={20} />} title="No data yet" message="How often each deal is ordered and what it brings in." />
        </Card>
        <Card className="md:col-span-2 xl:col-span-1">
          <CardHeader title="Repeat customers" hint="2 or more orders in range" />
          <EmptyState icon={<Repeat size={20} />} title="No data yet" message="Anyone who orders twice or more in the range shows up here." />
        </Card>
      </div>
    </div>
  );
}
