import { AuthShell } from "@/features/auth/components/auth-shell";
import { ResetPasswordForm } from "@/features/auth/components/auth-forms";
import { requireUser } from "@/server/auth/context";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  await requireUser();
  return (
    <AuthShell title="Choose a new password" subtitle="You'll be signed in afterwards.">
      <ResetPasswordForm />
    </AuthShell>
  );
}
