import { AuthShell } from "@/features/auth/components/auth-shell";
import { ResetPasswordForm } from "@/features/auth/components/auth-forms";
import { requireUser } from "@/server/auth/context";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("auth"))("reset.metaTitle") };
}

export default async function ResetPasswordPage() {
  await requireUser();
  const t = await getT("auth");
  return (
    <AuthShell title={t("reset.title")} subtitle={t("reset.subtitle")}>
      <ResetPasswordForm />
    </AuthShell>
  );
}
