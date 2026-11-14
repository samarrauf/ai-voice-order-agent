"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: null });
  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-4 rounded-lg border p-6">
      <h1 className="text-xl font-semibold">Dashboard login</h1>
      <input
        type="password"
        name="password"
        placeholder="Password"
        required
        autoFocus
        className="rounded border px-3 py-2"
      />
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="rounded bg-black px-3 py-2 text-white disabled:opacity-50">
        {pending ? "Checking..." : "Log in"}
      </button>
    </form>
  );
}
