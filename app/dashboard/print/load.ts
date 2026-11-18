import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { DEMO_RESTAURANT_ID } from "@/lib/agent/tools";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/dashboard-auth";
import { loadPrintData } from "@/lib/receipt-data";

// Shared start of both print pages: check the staff login, then load the order.
// Only Napoli uses the dashboard for now (see CLAUDE.md "Dashboard auth"), so the
// order must belong to that restaurant; anything else is a 404.
export async function loadOrderOr404(orderId: string) {
  if (!verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/dashboard/login");
  const data = await loadPrintData(orderId, DEMO_RESTAURANT_ID);
  if (!data) notFound();
  return data;
}

/** Print size from ?size=. 80mm thermal paper unless the link says a4. */
export const isA4 = (size: string | string[] | undefined) => size === "a4";

/** CSS @page rule: 80mm roll paper with a small margin, or A4. */
export const pageRule = (a4: boolean) =>
  a4 ? "@page{size:A4;margin:15mm}" : "@page{size:80mm auto;margin:3mm}";
