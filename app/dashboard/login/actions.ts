"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";
import { authenticateStaff } from "@/lib/staff-login";

export type LoginState = { error: string | null; username: string };

// One message for every failure (unknown username, wrong password, locked,
// switched off), so the form never reveals which usernames exist.
const INVALID = "Username or password is incorrect.";
const UNAVAILABLE = "Sign in is not available right now. Please try again in a minute.";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").slice(0, 100);
  const result = await authenticateStaff(username, formData.get("password"));
  if (!result.ok) return { error: result.reason === "unavailable" ? UNAVAILABLE : INVALID, username };

  (await cookies()).set(SESSION_COOKIE, signSession(result.staff), sessionCookieOptions());
  redirect("/dashboard");
}
