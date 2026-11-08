import { AuthShell } from "@/features/auth/components/auth-shell";
import { getSessionUser } from "@/server/auth/context";
import { redirect } from "next/navigation";
import { AcceptInvitationButton } from "@/features/organizations/components/accept-invitation-button";

export const metadata = { title: "Join organization" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-up?next=${encodeURIComponent(`/invite/${token}`)}`);
  return (
    <AuthShell title="Join your team" subtitle={`You're signed in as ${user.email}. The invitation must match this email address.`}>
      <AcceptInvitationButton token={token} />
    </AuthShell>
  );
}
