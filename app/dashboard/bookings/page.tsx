import { CalendarClock, CalendarDays } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, FilterChips, KpiCard, PageHeader } from "@/components/ui";

// Bookings: table reservations taken by the phone agent or by staff.
// Layout only for now; the booking list is wired in during a later phase.

const DAYS = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "This week" },
] as const;

const KPIS = ["Bookings", "Guests expected", "Next arrival", "Tables free"];

export default function BookingsPage() {
  return (
    <div className="anim-rise">
      <PageHeader
        title="Bookings"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            Table reservations, by day and time. <Badge>Coming soon</Badge>
          </span>
        }
      />

      <FilterChips label="Day" chips={DAYS} value="today" disabled className="mb-6" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KPIS.map((label) => (
          <KpiCard key={label} label={label} value="–" />
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Today's timeline" />
          <EmptyState
            className="min-h-64"
            icon={<CalendarClock size={20} />}
            title="No data yet"
            message="Each booking sits on its time slot here, so gaps and busy periods are easy to see."
          />
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Upcoming" />
          <EmptyState
            className="min-h-64"
            icon={<CalendarDays size={20} />}
            title="No data yet"
            message="The next arrivals are listed here with name, party size and table."
          />
        </Card>
      </div>
    </div>
  );
}
