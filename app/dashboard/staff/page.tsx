import { Card, PageHeader } from "@/components/ui";
import { requireCapabilityPage } from "@/lib/staff-page";
import { supabaseAdmin } from "@/lib/supabase/server";
import { StaffManager, type StaffEvent, type StaffRow } from "./staff-manager";

// Capability staff_manage (owner only, lib/permissions.ts). Anyone else is sent
// back to /dashboard, and /api/staff/accounts refuses them too (403).
// Lists this restaurant's logins and the last 20 staff events. The restaurant
// comes from the login. No password or hash ever leaves the server here.

export default async function StaffPage() {
  const me = await requireCapabilityPage("staff_manage");
  const rid = me.restaurantId;

  const [accounts, events, restaurant] = await Promise.all([
    supabaseAdmin
      .from("staff_accounts")
      .select("id, username, role, is_active, last_login_at, must_change_password, created_at")
      .eq("restaurant_id", rid)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("staff_account_events")
      .select("id, actor_staff_id, target_staff_id, event, detail, created_at")
      .eq("restaurant_id", rid)
      .order("created_at", { ascending: false })
      .limit(20),
    supabaseAdmin.from("restaurants").select("timezone").eq("id", rid).maybeSingle(),
  ]);

  if (accounts.error || events.error) {
    console.error("staff page: could not load", accounts.error?.message ?? events.error?.message);
    return (
      <div className="anim-rise">
        <PageHeader title="Staff" />
        <Card>
          <p className="text-sm text-ink-muted">Could not load the staff list. Please refresh the page.</p>
        </Card>
      </div>
    );
  }

  // Dates are written here on the server (restaurant's time zone), so the browser shows the same text.
  const timeZone = typeof restaurant.data?.timezone === "string" ? restaurant.data.timezone : "Europe/London";
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone, dateStyle: "medium", timeStyle: "short" });

  const rows: StaffRow[] = (accounts.data ?? []).map((a) => ({
    id: a.id,
    username: a.username,
    role: a.role,
    is_active: a.is_active,
    must_change_password: a.must_change_password,
    last_login_label: a.last_login_at ? when(a.last_login_at) : null,
  }));
  const log: StaffEvent[] = (events.data ?? []).map((e) => ({
    id: e.id,
    actor_staff_id: e.actor_staff_id,
    target_staff_id: e.target_staff_id,
    event: e.event,
    detail: (e.detail ?? {}) as Record<string, unknown>,
    when_label: when(e.created_at),
  }));

  return (
    <div className="anim-rise">
      <PageHeader title="Staff" subtitle="Logins for your team: who can sign in, and as what." />
      <StaffManager meId={me.staffId} accounts={rows} events={log} />
    </div>
  );
}
