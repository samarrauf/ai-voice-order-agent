import { Users } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, KpiCard, PageHeader } from "@/components/ui";

// Customers: everyone who has ordered, and how often.
// Layout only for now; the customer list is wired in during a later phase.

const KPIS = ["Customers", "New this month", "Repeat customers", "Average spend"];
const COLUMNS = ["Customer", "Phone", "Orders", "Total spent", "Last order"];

export default function CustomersPage() {
  return (
    <div className="anim-rise">
      <PageHeader
        title="Customers"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            Who orders, how often and how much. <Badge>Coming soon</Badge>
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KPIS.map((label) => (
          <KpiCard key={label} label={label} value="–" />
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader title="All customers" />
        <div className="hidden grid-cols-5 gap-4 border-b border-line pb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint md:grid">
          {COLUMNS.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <EmptyState
          className="min-h-64"
          icon={<Users size={20} />}
          title="No data yet"
          message="Customers appear here after their first order, newest first."
        />
      </Card>
    </div>
  );
}
