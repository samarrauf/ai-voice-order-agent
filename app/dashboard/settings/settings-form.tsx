"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, CardHeader } from "@/components/ui";
import { SERVICE_CHARGE_APPLIES_TO, type SettingsSection } from "@/lib/settings";

// The four Settings cards. Each card keeps its own copy of the values and has
// its own Save button, which posts just that section to /api/staff/settings.
// After a save the page is refreshed so new colours/names show everywhere.

export type SettingsValues = Record<string, string | number | boolean | null>;

type Field = {
  key: string;
  label: string;
  kind?: "text" | "number" | "select" | "color" | "textarea";
  hint?: string;
  options?: readonly string[];
  wide?: boolean;
};

const PROFILE: Field[] = [
  { key: "name", label: "Restaurant name" },
  { key: "tagline", label: "Tagline" },
  { key: "parent_group_name", label: "Part of a group (optional)", hint: "Shown as: by <group>" },
  { key: "phone", label: "Phone" },
  { key: "whatsapp_number", label: "WhatsApp number" },
  { key: "address_line", label: "Address" },
  { key: "city", label: "City" },
  { key: "postcode", label: "Postcode" },
  { key: "website_url", label: "Website", hint: "Starts with https://" },
  { key: "instagram_handle", label: "Instagram", hint: "e.g. @yourname" },
  { key: "facebook_url", label: "Facebook page link", hint: "Starts with https://" },
  { key: "receipt_footer_note", label: "Bill footer message", kind: "textarea", wide: true },
];

const MONEY: Field[] = [
  { key: "delivery_fee", label: "Delivery fee", kind: "number" },
  { key: "min_order_value", label: "Minimum order", kind: "number" },
  { key: "tax_rate_percent", label: "Tax %", kind: "number" },
  { key: "service_charge_percent", label: "Service charge %", kind: "number" },
  { key: "service_charge_applies_to", label: "Service charge applies to", kind: "select", options: SERVICE_CHARGE_APPLIES_TO },
  { key: "max_discount_percent", label: "Biggest discount staff can give %", kind: "number" },
];

const THEME: Field[] = [
  { key: "theme_primary", label: "Main colour", kind: "color" },
  { key: "theme_accent", label: "Accent colour", kind: "color" },
  { key: "theme_secondary", label: "Second colour", kind: "color" },
  { key: "theme_background", label: "Background", kind: "color" },
  { key: "theme_text", label: "Text colour", kind: "color" },
];

const input =
  "min-h-11 w-full rounded-xl border border-line bg-raised px-3 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong";

type Message = { ok: boolean; text: string } | null;

function Status({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <span role="status" className={message.ok ? "text-sm text-accent-ink" : "text-sm text-red-400"}>
      {message.text}
    </span>
  );
}

async function post(section: SettingsSection, values: Record<string, unknown>) {
  const res = await fetch("/api/staff/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ section, values }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

function SectionCard({
  section,
  title,
  hint,
  fields,
  initial,
}: {
  section: SettingsSection;
  title: string;
  hint?: string;
  fields: Field[];
  initial: SettingsValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<SettingsValues>(() =>
    Object.fromEntries(fields.map((f) => [f.key, initial[f.key] ?? ""])),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  async function save() {
    setSaving(true);
    setMessage(null);
    // Number boxes send numbers (blank -> NaN, which the server refuses); the rest goes as typed.
    const body = Object.fromEntries(
      fields.map((f) => [f.key, f.kind === "number" ? (values[f.key] === "" ? NaN : Number(values[f.key])) : values[f.key]]),
    );
    try {
      const { ok, json } = await post(section, body);
      if (ok) {
        setMessage({ ok: true, text: json.changed?.length ? "Saved." : "Nothing to change." });
        router.refresh();
      } else {
        setMessage({ ok: false, text: json.details?.join(" · ") ?? json.error ?? "Could not save." });
      }
    } catch {
      setMessage({ ok: false, text: "No connection. Try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-4 first:mt-0">
      <CardHeader title={title} hint={hint} />
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const value = String(values[f.key] ?? "");
          return (
            <label key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
              <span className="mb-1 block text-xs font-medium text-ink-muted">{f.label}</span>
              {f.kind === "select" ? (
                <select className={input} value={value} onChange={(e) => set(f.key, e.target.value)}>
                  {f.options!.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : f.kind === "textarea" ? (
                <textarea className={`${input} py-2`} rows={2} value={value} onChange={(e) => set(f.key, e.target.value)} />
              ) : f.kind === "color" ? (
                <span className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={f.label}
                    className="size-11 shrink-0 cursor-pointer rounded-xl border border-line bg-raised p-1"
                    value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#000000"}
                    onChange={(e) => set(f.key, e.target.value.toUpperCase())}
                  />
                  <input className={input} value={value} onChange={(e) => set(f.key, e.target.value)} />
                </span>
              ) : (
                <input
                  className={input}
                  type={f.kind === "number" ? "number" : "text"}
                  inputMode={f.kind === "number" ? "decimal" : undefined}
                  step={f.kind === "number" ? "0.01" : undefined}
                  min={f.kind === "number" ? 0 : undefined}
                  value={value}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )}
              {f.hint && <span className="mt-1 block text-xs text-ink-faint">{f.hint}</span>}
            </label>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Status message={message} />
      </div>
    </Card>
  );
}

function OrdersCard({ initial }: { initial: SettingsValues }) {
  const router = useRouter();
  const [on, setOn] = useState(Boolean(initial.is_accepting_orders));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function toggle() {
    const next = !on;
    setSaving(true);
    setMessage(null);
    try {
      const { ok, json } = await post("orders", { is_accepting_orders: next });
      if (ok) {
        setOn(next);
        setMessage({ ok: true, text: next ? "Orders are ON." : "Orders are OFF. The phone agent will say you are not taking orders." });
        router.refresh();
      } else {
        setMessage({ ok: false, text: json.error ?? "Could not save." });
      }
    } catch {
      setMessage({ ok: false, text: "No connection. Try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-4">
      <CardHeader title="Taking orders" hint="Applies at once, to calls and the POS" />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant={on ? "ghost" : "primary"} onClick={toggle} disabled={saving} aria-pressed={on}>
          {saving ? "Saving..." : on ? "Turn orders OFF" : "Turn orders ON"}
        </Button>
        <span className="text-sm text-ink-muted">
          Now: <strong className="text-ink">{on ? "taking orders" : "not taking orders"}</strong>
        </span>
        <Status message={message} />
      </div>
    </Card>
  );
}

/** 0.01 = to the penny (no rounding); 0.5 and 1 round the total to the nearest half or whole unit. */
function roundingLabel(step: SettingsValues[string]): string {
  const n = Number(step);
  if (n === 0.5) return "Nearest 0.50";
  if (n === 1) return "Nearest whole unit";
  return "No rounding (exact)";
}

/** Currency, timezone and rounding: shown, never editable (the server refuses them too). */
function FixedCard({ initial }: { initial: SettingsValues }) {
  return (
    <Card className="mt-4">
      <CardHeader title="Fixed settings" hint="Read-only: set up by us" />
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-ink-muted">Currency</dt>
          <dd className="mt-1 font-semibold">{String(initial.currency ?? "")}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-ink-muted">Timezone</dt>
          <dd className="mt-1 font-semibold">{String(initial.timezone ?? "")}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-ink-muted">Bill rounding</dt>
          <dd className="mt-1 font-semibold">{roundingLabel(initial.rounding_step)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-ink-faint">To change these, please contact us.</p>
    </Card>
  );
}

export function SettingsForm({ initial }: { initial: SettingsValues }) {
  return (
    <>
      <SectionCard section="profile" title="Restaurant profile" hint="Shown on bills and the dashboard" fields={PROFILE} initial={initial} />
      <SectionCard section="money" title="Charges and money" hint="Prices stay in the menu; these are the extras" fields={MONEY} initial={initial} />
      <OrdersCard initial={initial} />
      <FixedCard initial={initial} />
      <SectionCard section="theme" title="Colours" hint="Changes the dashboard colours" fields={THEME} initial={initial} />
    </>
  );
}
