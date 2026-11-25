import { Card, CardHeader, PageHeader } from "@/components/ui";
import { MESSAGE_COLUMNS, SETTINGS_COLUMNS } from "@/lib/settings";
import { requireCapabilityPage } from "@/lib/staff-page";
import { supabaseAdmin } from "@/lib/supabase/server";
import { MessagesCard } from "./messages-card";
import { SettingsForm, type SettingsValues } from "./settings-form";

// Capability settings_edit (owner only, lib/permissions.ts). Anyone else is sent
// back to /dashboard, and /api/staff/settings refuses them too (403). The
// restaurant comes from the login.

export default async function SettingsPage() {
  const { restaurantId } = await requireCapabilityPage("settings_edit");

  const [restaurant, audit, messages] = await Promise.all([
    supabaseAdmin.from("restaurants").select(SETTINGS_COLUMNS.join(", ")).eq("id", restaurantId).maybeSingle(),
    supabaseAdmin
      .from("settings_audit")
      .select("id, username, section, changes, created_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(10),
    // B4d: private table (RLS on, no policies); no row yet = nothing set.
    supabaseAdmin.from("restaurant_messages").select(MESSAGE_COLUMNS.join(", ")).eq("restaurant_id", restaurantId).maybeSingle(),
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
  const msg = (messages.data ?? null) as { google_review_url: string | null; thankyou_template: string | null } | null;

  return (
    <div className="anim-rise">
      <PageHeader title="Settings" subtitle="Your restaurant's details, charges, orders switch and colours." />
      {!msg?.google_review_url && (
        <p role="note" className="mb-4 rounded-xl border border-line bg-raised px-4 py-3 text-sm text-ink-muted">
          Yaad dihani: Google review link abhi khali hai. Neeche &quot;WhatsApp shukriya&quot; card mein daal dein, taake customers rating de sakein.
        </p>
      )}
      <SettingsForm initial={values} />
      <MessagesCard
        restaurantName={String(values.name ?? "")}
        currency={String(values.currency ?? "")}
        initialReviewUrl={msg?.google_review_url ?? null}
        initialTemplate={msg?.thankyou_template ?? null}
      />

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
