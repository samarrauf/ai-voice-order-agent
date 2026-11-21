import { PageHeader } from "@/components/ui";
import { requireStaffPage } from "@/lib/staff-page";
import { PasswordForm } from "./password-form";

// Every logged-in user (owner, manager, staff) can change their own password.
// While an account must change its password, the dashboard layout shows this
// form on every page instead (app/dashboard/layout.tsx).

export default async function PasswordPage() {
  const staff = await requireStaffPage({ allowPasswordChange: true });
  return (
    <div className="anim-rise mx-auto max-w-lg">
      <PageHeader title="My password" subtitle="Changing it logs this login out on every other device." />
      <PasswordForm forced={staff.mustChangePassword} />
    </div>
  );
}
