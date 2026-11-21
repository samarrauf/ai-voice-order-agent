"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, CardHeader } from "@/components/ui";

// "Change my password", for every logged-in user. Posts to /api/staff/password.
// `forced`: the account was just created or reset by the owner, so the rest of
// the dashboard stays closed until a new password is chosen.

const MIN = 10;
const input =
  "min-h-11 w-full rounded-xl border border-line bg-raised px-3 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong";

export function PasswordForm({ forced = false }: { forced?: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (next.length < MIN) return setMessage({ ok: false, text: `The new password needs at least ${MIN} characters.` });
    if (next !== again) return setMessage({ ok: false, text: "The two new passwords are not the same." });
    setBusy(true);
    try {
      const res = await fetch("/api/staff/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ ok: false, text: json.message ?? "Could not change the password." });
        if (res.status === 401) router.replace("/dashboard/login");
        return;
      }
      setCurrent("");
      setNext("");
      setAgain("");
      if (forced) {
        router.replace("/dashboard");
        router.refresh();
      } else {
        setMessage({ ok: true, text: "Password changed. Any other device using this login has been logged out." });
        router.refresh();
      }
    } catch {
      setMessage({ ok: false, text: "No connection. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={forced ? "Choose your own password" : "Change my password"}
        hint={forced ? "Required before you can use the dashboard" : undefined}
      />
      {forced && (
        <p className="mb-4 text-sm text-ink-muted">
          You signed in with a password the owner gave you. Pick a new one that only you know.
        </p>
      )}
      <form onSubmit={submit} className="grid gap-3">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">{forced ? "Password you were given" : "Current password"}</span>
          <input className={input} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">New password</span>
          <input className={input} type="password" autoComplete="new-password" minLength={MIN} value={next} onChange={(e) => setNext(e.target.value)} required />
          <span className="text-xs text-ink-faint">At least {MIN} characters.</span>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">New password again</span>
          <input className={input} type="password" autoComplete="new-password" minLength={MIN} value={again} onChange={(e) => setAgain(e.target.value)} required />
        </label>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving..." : "Change password"}
          </Button>
          {message && (
            <span role="status" className={message.ok ? "text-sm text-brand-ink" : "text-sm text-danger"}>
              {message.text}
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}
