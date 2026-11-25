import { Suspense } from "react";
import { CircleAlert } from "lucide-react";
import { Card, EmptyState, PageHeader, Skeleton, SkeletonCard } from "@/components/ui";
import { isReportRange, type ReportRange } from "@/lib/reports";
import { loadReport, type ReportData } from "@/lib/reports-data";
import { requireCapabilityPage } from "@/lib/staff-page";
import { DailyCard, HourlyCard, KpiGrid, PaymentsCard, ProfitGrid, RangePicker, SourcesCard, TopItemsCard, TypesCard, UnpaidCard } from "./reports-parts";

// Reports (P4). Capability view_reports: owner and manager; staff are sent back to /dashboard
// (and /api/staff/reports gives them 403). The restaurant comes from the login session.
// Profit parts appear only for the owner: lib/reports-data.ts adds `profit` for view_profit alone.

type Search = Promise<{ range?: string | string[]; from?: string | string[]; to?: string | string[] }>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const nice = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

async function Reports({ searchParams }: { searchParams: Search }) {
  const staff = await requireCapabilityPage("view_reports");
  const params = await searchParams;
  const raw = first(params.range);
  const range: ReportRange = isReportRange(raw) ? raw : "today";

  let data: ReportData;
  try {
    data = await loadReport({ restaurantId: staff.restaurantId, role: staff.role, range, from: first(params.from), to: first(params.to) });
  } catch (error) {
    console.error("reports: failed to load", error);
    return (
      <Card>
        <EmptyState className="min-h-64" icon={<CircleAlert size={20} />} title="Could not load the reports" message="Please refresh the page. If it keeps happening, check the internet connection." />
      </Card>
    );
  }

  const { report, currency, timeZone } = data;
  const { fromDate, toDate, dayStart } = report.period;
  const dates = fromDate === toDate ? nice(fromDate) : `${nice(fromDate)} - ${nice(toDate)}`;
  return (
    <div className="grid gap-4">
      <PageHeader title="Reports" subtitle={`${dates} · day starts at ${dayStart} · sales are without tax; cancelled orders left out, refunds taken off`} />
      <RangePicker range={report.period.range} fromDate={fromDate} toDate={toDate} />
      <KpiGrid report={report} currency={currency} />
      <ProfitGrid report={report} currency={currency} />
      <div className="grid gap-4 lg:grid-cols-2">
        <HourlyCard report={report} currency={currency} i={7} />
        <DailyCard report={report} currency={currency} i={8} />
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <TopItemsCard report={report} currency={currency} i={9} />
        </div>
        <div className="lg:col-span-5">
          <PaymentsCard report={report} currency={currency} i={10} />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <SourcesCard report={report} currency={currency} i={11} />
        <TypesCard report={report} currency={currency} i={12} />
      </div>
      <UnpaidCard report={report} currency={currency} timeZone={timeZone} i={13} />
    </div>
  );
}

function ReportsSkeleton() {
  return (
    <div role="status" aria-label="Loading the reports" className="grid gap-4">
      <Skeleton className="h-10 w-56 max-w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonCard className="h-72" />
        <SkeletonCard className="h-72" />
      </div>
    </div>
  );
}

export default function ReportsPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<ReportsSkeleton />}>
      <Reports searchParams={searchParams} />
    </Suspense>
  );
}
