import { NextResponse } from "next/server";
import { loadReport } from "@/lib/reports-data";
import { isReportRange } from "@/lib/reports";
import { requireCapability } from "@/lib/staff-auth";

// GET /api/staff/reports?range=today|yesterday|7d|30d|month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD
//   - Capability view_reports (owner, manager); staff get 403. The restaurant comes from
//     the login session ONLY: a restaurant_id in the query is refused (403).
//   - The owner's report has a `profit` part and per-item profit; a manager's report has
//     no cost/profit field at all (lib/reports-data.ts never queries them for that role).

export async function GET(request: Request) {
  const auth = await requireCapability(request, "view_reports");
  if (!auth.ok) return auth.response;
  const { restaurantId, role } = auth.staff;

  const url = new URL(request.url);
  if (url.searchParams.has("restaurant_id")) {
    return NextResponse.json({ success: false, error: "forbidden" }, { status: 403 });
  }
  const raw = url.searchParams.get("range");
  const range = isReportRange(raw) ? raw : "today";

  try {
    const data = await loadReport({ restaurantId, role, range, from: url.searchParams.get("from"), to: url.searchParams.get("to") });
    return NextResponse.json({ success: true, currency: data.currency, timeZone: data.timeZone, report: data.report });
  } catch (error) {
    console.error("reports: failed to load", error);
    return NextResponse.json({ success: false, error: "could not load the report" }, { status: 500 });
  }
}
