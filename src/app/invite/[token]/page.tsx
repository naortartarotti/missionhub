import { AuthShell } from "@/features/auth/components/auth-shell";
import { getSessionUser } from "@/server/auth/context";
import { redirect } from "next/navigation";
import { AcceptInvitationButton } from "@/features/organizations/components/accept-invitation-button";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("onboarding"))("invite.metaTitle") };
}

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-up?next=${encodeURIComponent(`/invite/${token}`)}`);
  const t = await getT("onboarding");
  return (
    <AuthShell title={t("invite.title")} subtitle={t("invite.subtitle", { email: user.email })}>
      <AcceptInvitationButton token={token} />
    </AuthShell>
  );
}
