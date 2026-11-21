import { Suspense } from "react";
import { CircleAlert } from "lucide-react";
import { Card, EmptyState, Skeleton, SkeletonCard } from "@/components/ui";
import { loadHome, type HomeData } from "@/lib/dashboard-home";
import { isRangeKey, type RangeKey } from "@/lib/dashboard-stats";
import { requireStaffPage } from "@/lib/staff-page";
import { supabaseAdmin } from "@/lib/supabase/server";
import { AutoRefresh } from "./auto-refresh";
import { CollectedCard, KpiRow, LiveList, MixCard, QuickCards, RangePills, SalesChart } from "./home-parts";

// Home: the first page after login (the live orders board moved to /dashboard/orders).
// Owner and manager (view_reports) see sales, charts and payments; staff see only what
// is going on right now (orders in progress, waiting orders, tables, latest orders).
// All data comes from lib/dashboard-home.ts, which also enforces that split.

/** "owner-ali" -> "Owner-ali": the login name is all we have to greet with. */
const greetingName = (username: string) => (username ? username.charAt(0).toUpperCase() + username.slice(1) : "there");

async function Home({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  // The restaurant and role always come from the login session.
  const staff = await requireStaffPage();
  const params = await searchParams;
  const rawRange = Array.isArray(params.range) ? params.range[0] : params.range;
  const range: RangeKey = isRangeKey(rawRange) ? rawRange : "today";

  let data: HomeData;
  let username = "";
  const now = new Date();
  try {
    const [home, account] = await Promise.all([
      loadHome({ restaurantId: staff.restaurantId, role: staff.role, range, now }),
      supabaseAdmin.from("staff_accounts").select("username").eq("id", staff.staffId).eq("restaurant_id", staff.restaurantId).maybeSingle(),
    ]);
    data = home;
    username = account.data?.username ?? "";
  } catch (error) {
    console.error("dashboard: failed to load home", error);
    return (
      <Card>
        <EmptyState className="min-h-64" icon={<CircleAlert size={20} />} title="Could not load the dashboard" message="Please refresh the page. If it keeps happening, check the internet connection." />
      </Card>
    );
  }

  const today = new Intl.DateTimeFormat("en-GB", { timeZone: data.timeZone, weekday: "long", day: "numeric", month: "long" }).format(now);
  const report = data.reports;
  return (
    <div className="grid gap-4">
      <AutoRefresh />
      <div className="home-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Assalam o Alaikum, {greetingName(username)}</h1>
          <p className="mt-1.5 text-sm text-ink-muted">{today}</p>
        </div>
        {report && <RangePills value={range} />}
      </div>

      <KpiRow data={data} range={range} start={1} />

      {report ? (
        <>
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <SalesChart report={report} range={range} currency={data.currency} i={5} />
            </div>
            <div className="grid content-start gap-4 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-1">
              <QuickCards data={data} start={6} />
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <MixCard report={report} i={8} />
            </div>
            <div className="lg:col-span-3">
              <CollectedCard report={report} currency={data.currency} i={9} />
            </div>
            <div className="lg:col-span-4">
              <LiveList orders={data.ops.live} now={now} currency={data.currency} i={10} />
            </div>
          </div>
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="grid content-start gap-4 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1">
            <QuickCards data={data} start={5} />
          </div>
          <div className="lg:col-span-7">
            <LiveList orders={data.ops.live} now={now} currency={data.currency} i={7} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Shown while Home loads: the same bento shape in shimmering grey. */
function HomeSkeleton() {
  return (
    <div role="status" aria-label="Loading the dashboard" className="grid gap-4">
      <div>
        <Skeleton className="h-10 w-72 max-w-full" />
        <Skeleton className="mt-3 h-4 w-40" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <SkeletonCard className="h-72 lg:col-span-8" />
        <SkeletonCard className="h-72 lg:col-span-4" />
      </div>
    </div>
  );
}

export default function HomePage({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <Home searchParams={searchParams} />
    </Suspense>
  );
}
