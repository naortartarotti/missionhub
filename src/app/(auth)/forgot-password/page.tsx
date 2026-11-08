import Link from "next/link";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/components/auth-forms";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a secure link." footer={<Link className="underline-offset-4 hover:underline" href="/sign-in">Back to sign in</Link>}>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
