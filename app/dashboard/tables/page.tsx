import { LayoutGrid } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, KpiCard, PageHeader } from "@/components/ui";

// Tables: the dining room floor: which tables are free, seated or booked.
// Layout only for now; live table status is wired in during a later phase.

const KPIS = ["Free", "Seated", "Booked next", "Seats in use"];

export default function TablesPage() {
  return (
    <div className="anim-rise">
      <PageHeader
        title="Tables"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            The dining room at a glance. <Badge>Coming soon</Badge>
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KPIS.map((label) => (
          <KpiCard key={label} label={label} value="–" />
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader title="Floor" />
        {/* Dashed tiles hint at where each table will sit. */}
        <div aria-hidden className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="aspect-square rounded-xl border border-dashed border-line" />
          ))}
        </div>
        <EmptyState
          icon={<LayoutGrid size={20} />}
          title="No data yet"
          message="Each table shows here as free, seated or booked, with one tap to seat or clear it."
        />
      </Card>
    </div>
  );
}
