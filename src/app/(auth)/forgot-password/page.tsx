import Link from "next/link";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/components/auth-forms";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("auth"))("forgot.metaTitle") };
}

export default async function ForgotPasswordPage() {
  const t = await getT("auth");
  return (
    <AuthShell title={t("forgot.title")} subtitle={t("forgot.subtitle")} footer={<Link className="underline-offset-4 hover:underline" href="/sign-in">{t("forgot.backToSignIn")}</Link>}>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
