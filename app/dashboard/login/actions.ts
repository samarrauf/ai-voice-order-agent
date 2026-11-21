"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";
import { authenticateStaff, loadLoginState } from "@/lib/staff-login";
import { PASSWORD_PAGE } from "@/lib/staff-page";

export type LoginState = { error: string | null; username: string };

// One message for every failure (unknown username, wrong password, locked,
// switched off), so the form never reveals which usernames exist.
const INVALID = "Username or password is incorrect.";
const UNAVAILABLE = "Sign in is not available right now. Please try again in a minute.";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").slice(0, 100);
  const result = await authenticateStaff(username, formData.get("password"));
  if (!result.ok) return { error: result.reason === "unavailable" ? UNAVAILABLE : INVALID, username };

  const state = await loadLoginState(result.staff.staffId);
  if (!state) return { error: UNAVAILABLE, username };

  (await cookies()).set(SESSION_COOKIE, signSession({ ...result.staff, sessionVersion: state.sessionVersion }), sessionCookieOptions());
  // A new or reset account picks its own password before anything else.
  redirect(state.mustChangePassword ? PASSWORD_PAGE : "/dashboard");
}
