"use client";

import { ActionForm } from "@/components/shared/action-form";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRightLeft, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { FormMessage } from "@/components/shared/form-message";
import { SubmitButton } from "@/components/shared/submit-button";
import { NativeSelect } from "@/components/shared/native-select";
import { inviteMember, revokeInvitation, transferPortfolio, updateMember } from "../actions";
import { useGlobalT, useT } from "@/i18n/client";

const ROLES = ["org_admin", "recruiter_manager", "recruiter"] as const;
type Role = (typeof ROLES)[number];

export function InviteForm({ orgSlug }: { orgSlug: string }) {
  const [state, action] = useActionState(inviteMember.bind(null, orgSlug), null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const t = useT("settings");
  const tg = useGlobalT();
  return (
    <ActionForm action={action} className="grid gap-4">
      {/* items-start + button offset (label 20px + 6px gap) keeps the row aligned when Email shows an error. */}
      <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-start">
        <FormField id="email" label={t("team.email")} error={fe?.email}><Input id="email" name="email" type="email" required /></FormField>
        <FormField id="role" label={t("team.role")}>
          <NativeSelect id="role" name="role" defaultValue="recruiter">{ROLES.map((v) => <option key={v} value={v}>{tg(`labels.role.${v}`)}</option>)}</NativeSelect>
        </FormField>
        <SubmitButton pendingLabel={t("team.inviting")} className="sm:mt-[26px]">{t("team.invite")}</SubmitButton>
      </div>
      <FormMessage state={state} />
      {state?.ok && state.data ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border p-2 pl-4">
          <code className="flex-1 truncate text-xs">{state.data.link}</code>
          <Button type="button" variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(state.data!.link).then(() => toast.success(t("team.linkCopied")))}>
            <Copy className="size-3.5" aria-hidden /> {t("team.copy")}
          </Button>
        </div>
      ) : null}
    </ActionForm>
  );
}

export function MemberControls({ orgSlug, membershipId, role, status, isSelf }: { orgSlug: string; membershipId: string; role: Role; status: "active" | "suspended"; isSelf: boolean }) {
  const t = useT("settings");
  const tg = useGlobalT();
  const [pending, start] = useTransition();
  if (isSelf) return <span className="text-sm text-muted-foreground">{t("team.you")}</span>;
  const run = (patch: { role?: string; status?: string }) =>
    start(async () => {
      const r = await updateMember(orgSlug, { membershipId, ...patch });
      if (r.ok) toast.success(r.message ?? t("team.updated"));
      else toast.error(r.error);
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-48">
        <NativeSelect aria-label={t("team.role")} defaultValue={role} disabled={pending} onChange={(e) => run({ role: e.target.value })}>
          {ROLES.map((v) => <option key={v} value={v}>{tg(`labels.role.${v}`)}</option>)}
        </NativeSelect>
      </div>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => run({ status: status === "active" ? "suspended" : "active" })}>
        {status === "active" ? t("team.suspend") : t("team.reactivate")}
      </Button>
    </div>
  );
}

export function RevokeInviteButton({ orgSlug, invitationId }: { orgSlug: string; invitationId: string }) {
  const t = useT("settings");
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { const r = await revokeInvitation(orgSlug, invitationId); if (r.ok) toast.success(r.message ?? t("team.revoked")); else toast.error(r.error); })}>
      {t("team.revoke")}
    </Button>
  );
}

/** Moves everything a member owns (candidates, jobs, connectors) to a teammate, e.g. when they leave. */
export function TransferPortfolioButton({
  orgSlug,
  fromUserId,
  fromName,
  owned,
  teammates,
}: {
  orgSlug: string;
  fromUserId: string;
  fromName: string;
  owned: { candidates: number; jobs: number };
  teammates: { userId: string; name: string }[];
}) {
  const t = useT("settings");
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(teammates[0]?.userId ?? "");
  const [pending, start] = useTransition();
  if (!teammates.length || owned.candidates + owned.jobs === 0) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><ArrowRightLeft className="size-3.5" aria-hidden /> {t("team.transfer")}</Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("team.transferTitle", { name: fromName })}</DialogTitle>
          <DialogDescription>{t("team.transferDescription", { candidates: owned.candidates, jobs: owned.jobs })}</DialogDescription>
        </DialogHeader>
        <FormField id={`transfer-${fromUserId}`} label={t("team.transferTo")}>
          <NativeSelect id={`transfer-${fromUserId}`} value={to} onChange={(e) => setTo(e.target.value)}>
            {teammates.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
          </NativeSelect>
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("team.cancel")}</Button>
          <Button
            disabled={pending || !to}
            onClick={() =>
              start(async () => {
                const r = await transferPortfolio(orgSlug, { fromUserId, toUserId: to });
                if (r.ok) {
                  toast.success(r.message ?? "");
                  setOpen(false);
                } else toast.error(r.error);
              })
            }
          >
            {t("team.transferConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
