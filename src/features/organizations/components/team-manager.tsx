"use client";

import { ActionForm } from "@/components/shared/action-form";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { FormMessage } from "@/components/shared/form-message";
import { SubmitButton } from "@/components/shared/submit-button";
import { NativeSelect } from "@/components/shared/native-select";
import { inviteMember, revokeInvitation, updateMember } from "../actions";

const ROLES = { org_admin: "Organization admin", recruiter_manager: "Recruiter manager", recruiter: "Recruiter" } as const;

export function InviteForm({ orgSlug }: { orgSlug: string }) {
  const [state, action] = useActionState(inviteMember.bind(null, orgSlug), null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <ActionForm action={action} className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
        <FormField id="email" label="Email" error={fe?.email}><Input id="email" name="email" type="email" required /></FormField>
        <FormField id="role" label="Role">
          <NativeSelect id="role" name="role" defaultValue="recruiter">{Object.entries(ROLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect>
        </FormField>
        <SubmitButton pendingLabel="Inviting…">Invite</SubmitButton>
      </div>
      <FormMessage state={state} />
      {state?.ok && state.data ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border p-2 pl-4">
          <code className="flex-1 truncate text-xs">{state.data.link}</code>
          <Button type="button" variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(state.data!.link).then(() => toast.success("Link copied"))}>
            <Copy className="size-3.5" aria-hidden /> Copy
          </Button>
        </div>
      ) : null}
    </ActionForm>
  );
}

export function MemberControls({ orgSlug, membershipId, role, status, isSelf }: { orgSlug: string; membershipId: string; role: keyof typeof ROLES; status: "active" | "suspended"; isSelf: boolean }) {
  const [pending, start] = useTransition();
  if (isSelf) return <span className="text-sm text-muted-foreground">You</span>;
  const run = (patch: { role?: string; status?: string }) =>
    start(async () => {
      const r = await updateMember(orgSlug, { membershipId, ...patch });
      if (r.ok) toast.success(r.message ?? "Updated");
      else toast.error(r.error);
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-48">
        <NativeSelect aria-label="Role" defaultValue={role} disabled={pending} onChange={(e) => run({ role: e.target.value })}>
          {Object.entries(ROLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </NativeSelect>
      </div>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => run({ status: status === "active" ? "suspended" : "active" })}>
        {status === "active" ? "Suspend" : "Reactivate"}
      </Button>
    </div>
  );
}

export function RevokeInviteButton({ orgSlug, invitationId }: { orgSlug: string; invitationId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { const r = await revokeInvitation(orgSlug, invitationId); if (r.ok) toast.success(r.message ?? "Revoked"); else toast.error(r.error); })}>
      Revoke
    </Button>
  );
}
