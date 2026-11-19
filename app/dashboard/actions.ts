"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/session";

/** Logs out: removes the login cookie and goes back to the login page. */
export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/dashboard/login");
}
