"use client";

import { useActionState } from "react";
import { ArrowRight, CircleAlert, Lock, User } from "lucide-react";
import { Button } from "@/components/ui";
import { login, type LoginState } from "./actions";

const inputClass =
  "min-h-12 w-full rounded-xl border border-line bg-raised pl-11 pr-4 text-base transition-colors duration-200 placeholder:text-ink-faint hover:border-line-strong focus:border-accent-line";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: null, username: "" });
  return (
    <form action={action} className="flex w-full flex-col gap-5 glass rounded-card p-6 sm:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Staff sign in</h1>
        <p className="mt-1 text-sm text-ink-muted">Use the username and password from your restaurant.</p>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Username</span>
        <span className="relative">
          <User size={16} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            name="username"
            defaultValue={state.username}
            placeholder="Your username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={50}
            required
            autoFocus
            aria-invalid={state.error ? true : undefined}
            className={inputClass}
          />
        </span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Password</span>
        <span className="relative">
          <Lock size={16} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            type="password"
            name="password"
            placeholder="••••••••"
            autoComplete="current-password"
            maxLength={200}
            required
            aria-invalid={state.error ? true : undefined}
            className={inputClass}
          />
        </span>
      </label>

      {state.error && (
        <p role="alert" className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/12 px-3 py-2.5 text-sm text-danger">
          <CircleAlert size={16} aria-hidden className="shrink-0" />
          {state.error}
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" disabled={pending} className="w-full">
        {pending ? "Checking..." : "Log in"}
        {!pending && <ArrowRight size={18} aria-hidden />}
      </Button>
    </form>
  );
}
