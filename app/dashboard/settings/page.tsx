import { Card, CardHeader, PageHeader } from "@/components/ui";
import { SETTINGS_COLUMNS } from "@/lib/settings";
import { requireCapabilityPage } from "@/lib/staff-page";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SettingsForm, type SettingsValues } from "./settings-form";

// Capability settings_edit (owner only, lib/permissions.ts). Anyone else is sent
// back to /dashboard, and /api/staff/settings refuses them too (403). The
// restaurant comes from the login.

export default async function SettingsPage() {
  const { restaurantId } = await requireCapabilityPage("settings_edit");

  const [restaurant, audit] = await Promise.all([
    supabaseAdmin.from("restaurants").select(SETTINGS_COLUMNS.join(", ")).eq("id", restaurantId).maybeSingle(),
    supabaseAdmin
      .from("settings_audit")
      .select("id, username, section, changes, created_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (restaurant.error || !restaurant.data) {
    return (
      <div className="anim-rise">
        <PageHeader title="Settings" />
        <Card>
          <p className="text-sm text-ink-muted">Could not load the settings. Please refresh the page.</p>
        </Card>
      </div>
    );
  }

  const values = restaurant.data as unknown as SettingsValues;
  const timeZone = typeof values.timezone === "string" ? values.timezone : "Europe/London";

  return (
    <div className="anim-rise">
      <PageHeader title="Settings" subtitle="Your restaurant's details, charges, orders switch and colours." />
      <SettingsForm initial={values} />

      <Card className="mt-4">
        <CardHeader title="Recent changes" hint="Last 10 saves" />
        {(audit.data ?? []).length === 0 ? (
          <p className="text-sm text-ink-faint">Nothing changed yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {(audit.data ?? []).map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                <span>
                  <span className="font-semibold">{row.username}</span> changed{" "}
                  <span className="text-ink-muted">{Object.keys(row.changes as object).join(", ")}</span>
                </span>
                <span className="text-xs text-ink-faint">{new Date(row.created_at).toLocaleString("en-GB", { timeZone })}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
