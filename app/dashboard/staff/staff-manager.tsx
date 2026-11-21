"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { ROLE_LABELS, STAFF_ROLES, type StaffRole } from "@/lib/permissions";

// The owner's Staff page: the list of logins, a form for a new one, and per
// login: role, switch off / on, reset password. Every action posts to
// /api/staff/accounts; the server makes any new password and it is shown here
// ONCE (it is not kept anywhere, so it cannot be shown again).

export type StaffRow = {
  id: string;
  username: string;
  role: StaffRole;
  is_active: boolean;
  must_change_password: boolean;
  last_login_label: string | null;
};

export type StaffEvent = {
  id: string;
  actor_staff_id: string | null;
  target_staff_id: string | null;
  event: string;
  detail: Record<string, unknown>;
  when_label: string;
};

const input =
  "min-h-11 w-full rounded-xl border border-line bg-raised px-3 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong";

type Message = { ok: boolean; text: string } | null;
type Secret = { username: string; password: string; reason: "created" | "reset" } | null;

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/staff/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

/** The new password, shown once, with a copy button and a clear warning. */
function OneTimePassword({ secret, onDone }: { secret: NonNullable<Secret>; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <Card className="mb-4 border-accent-line">
      <CardHeader title={secret.reason === "created" ? `Login created: ${secret.username}` : `New password for ${secret.username}`} />
      <p className="mb-3 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/12 px-3 py-2.5 text-sm text-danger">
        <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
        Write it down or copy it now: it will not be shown again. They must choose their own password when they first sign in.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <code className="rounded-xl border border-line bg-raised px-3 py-2 font-mono text-base tracking-wide select-all">{secret.password}</code>
        <Button onClick={copy}>
          {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="primary" onClick={onDone}>
          I have saved it
        </Button>
      </div>
    </Card>
  );
}

function describe(e: StaffEvent, names: Map<string, string>): string {
  const actor = e.actor_staff_id ? (names.get(e.actor_staff_id) ?? "a removed login") : "someone";
  const target = String(e.detail.username ?? (e.target_staff_id ? names.get(e.target_staff_id) : "") ?? "a login");
  const role = (r: unknown) => ROLE_LABELS[r as StaffRole] ?? String(r);
  switch (e.event) {
    case "created":
      return `${actor} created ${target} (${role(e.detail.role)})`;
    case "role_changed":
      return `${actor} changed ${target} from ${role(e.detail.from)} to ${role(e.detail.to)}`;
    case "deactivated":
      return `${actor} switched off ${target}`;
    case "activated":
      return `${actor} switched on ${target}`;
    case "password_reset":
      return `${actor} reset the password of ${target}`;
    case "password_changed":
      return `${target} changed their password`;
    default:
      return `${actor}: ${e.event} ${target}`;
  }
}

export function StaffManager({ meId, accounts, events }: { meId: string; accounts: StaffRow[]; events: StaffEvent[] }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<StaffRole>("staff");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [secret, setSecret] = useState<Secret>(null);
  const names = new Map(accounts.map((a) => [a.id, a.username]));

  async function run(key: string, body: Record<string, unknown>, done?: (json: Record<string, unknown>) => void) {
    setBusy(key);
    setMessage(null);
    try {
      const { ok, json } = await post(body);
      if (!ok) {
        setMessage({ ok: false, text: json.message ?? json.error ?? "Could not save." });
        return;
      }
      done?.(json);
      router.refresh();
    } catch {
      setMessage({ ok: false, text: "No connection. Try again." });
    } finally {
      setBusy(null);
    }
  }

  function create(e: React.FormEvent) {
    e.preventDefault();
    void run("create", { action: "create", username, role }, (json) => {
      setSecret({ username: String(json.username), password: String(json.password), reason: "created" });
      setUsername("");
      setMessage({ ok: true, text: "Login created." });
    });
  }

  function reset(a: StaffRow) {
    if (!window.confirm(`Reset the password of ${a.username}? They will be logged out everywhere.`)) return;
    void run(`reset-${a.id}`, { action: "reset_password", staff_id: a.id }, (json) => {
      setSecret({ username: a.username, password: String(json.password), reason: "reset" });
      setMessage({ ok: true, text: "Password reset." });
    });
  }

  function toggle(a: StaffRow) {
    if (a.is_active && !window.confirm(`Switch off ${a.username}? They will be logged out at once.`)) return;
    void run(`toggle-${a.id}`, { action: a.is_active ? "deactivate" : "activate", staff_id: a.id }, () =>
      setMessage({ ok: true, text: a.is_active ? "Login switched off." : "Login switched on." }),
    );
  }

  function changeRole(a: StaffRow, next: StaffRole) {
    if (next === a.role) return;
    void run(`role-${a.id}`, { action: "set_role", staff_id: a.id, role: next }, () => setMessage({ ok: true, text: "Role changed." }));
  }

  return (
    <>
      {secret && <OneTimePassword secret={secret} onDone={() => setSecret(null)} />}

      <Card>
        <CardHeader title="New login" hint="The server makes a strong password and shows it once" />
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Username</span>
            <input
              className={input}
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="e.g. ali-till"
              pattern="[a-z0-9][a-z0-9_\-]{2,29}"
              title="3 to 30 characters: a-z, 0-9, - or _"
              autoComplete="off"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Role</span>
            <select className={input} value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="primary" disabled={busy !== null}>
            {busy === "create" ? "Creating..." : "Create login"}
          </Button>
        </form>
        <p className="mt-3 text-xs text-ink-faint">
          Owner: everything. Manager: menu, tables, cancels, refunds, reports. Staff: orders, payments, printing.
        </p>
      </Card>

      {message && (
        <p role="status" className={message.ok ? "mt-4 text-sm text-accent-ink" : "mt-4 text-sm text-danger"}>
          {message.text}
        </p>
      )}

      <Card className="mt-4">
        <CardHeader title="Logins" hint={`${accounts.length} in total`} />
        <ul className="divide-y divide-line">
          {accounts.map((a) => {
            const isMe = a.id === meId;
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    <span className="truncate">{a.username}</span>
                    {isMe && <Badge>You</Badge>}
                    <Badge tone={a.is_active ? "ready" : "danger"} dot>
                      {a.is_active ? "Active" : "Switched off"}
                    </Badge>
                    {a.must_change_password && <Badge tone="preparing">Must set password</Badge>}
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">Last login: {a.last_login_label ?? "never"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Role of ${a.username}`}
                    className={`${input} w-auto`}
                    value={a.role}
                    disabled={isMe || busy !== null}
                    title={isMe ? "You cannot change your own role" : undefined}
                    onChange={(e) => changeRole(a, e.target.value as StaffRole)}
                  >
                    {STAFF_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  {!isMe && (
                    <>
                      <Button onClick={() => toggle(a)} disabled={busy !== null}>
                        {a.is_active ? "Switch off" : "Switch on"}
                      </Button>
                      <Button onClick={() => reset(a)} disabled={busy !== null}>
                        Reset password
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Recent changes" hint="Last 20" />
        {events.length === 0 ? (
          <p className="text-sm text-ink-faint">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                <span>{describe(e, names)}</span>
                <span className="text-xs text-ink-faint">{e.when_label}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
