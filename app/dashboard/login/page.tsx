import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/staff-page";
import { LoginForm } from "./login-form";

// The centred frame around the form comes from LoginFrame in app/dashboard/layout.tsx.
// Already logged in? Go straight to the dashboard.
export default async function LoginPage() {
  if (await getStaffSession()) redirect("/dashboard");
  return <LoginForm />;
}
