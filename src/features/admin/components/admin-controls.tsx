"use client";

import { ActionForm } from "@/components/shared/action-form";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { FormMessage } from "@/components/shared/form-message";
import { SubmitButton } from "@/components/shared/submit-button";
import { publishRule, resolveDispute, setSuspension } from "../actions";

export function SuspendButton({ orgId, suspended }: { orgId: string; suspended: boolean }) {
  return suspended ? (
    <ConfirmDialog trigger={<Button size="sm" variant="outline">Reinstate</Button>} title="Reinstate organization?" description="Members regain access. Matching resumes on the next change." confirmLabel="Reinstate" onConfirm={() => setSuspension({ orgId, suspend: false, reason: "" })} />
  ) : (
    <ConfirmDialog
      trigger={<Button size="sm" variant="outline">Suspend</Button>}
      title="Suspend organization?"
      description="Members immediately lose access. Its jobs and candidates stop matching; existing referrals and finance records are preserved and remain visible to partners; partners can't submit to its jobs."
      confirmLabel="Suspend"
      destructive
      reasonLabel="Reason"
      reasonRequired
      onConfirm={(reason) => setSuspension({ orgId, suspend: true, reason })}
    />
  );
}

export function DisputeResolution({ disputeId }: { disputeId: string }) {
  return (
    <div className="flex gap-2">
      <ConfirmDialog trigger={<Button size="sm">Resolve</Button>} title="Resolve dispute" description="The placement returns to its prior status. Record any corrections as compensating evidence." confirmLabel="Resolve" reasonLabel="Resolution" reasonRequired onConfirm={(r) => resolveDispute({ disputeId, upheld: true, resolution: r })} />
      <ConfirmDialog trigger={<Button size="sm" variant="outline">Reject</Button>} title="Reject dispute" description="The placement returns to its prior status." confirmLabel="Reject" reasonLabel="Reason" reasonRequired onConfirm={(r) => resolveDispute({ disputeId, upheld: false, resolution: r })} />
    </div>
  );
}

export function RuleForm({ current }: { current: { sourcing: number; jobOwner: number; platform: number } }) {
  const [state, action] = useActionState(publishRule, null);
  return (
    <ActionForm action={action} className="grid gap-4">
      <input type="hidden" name="name" value="Standard marketplace split" />
      <div className="grid grid-cols-3 gap-3">
        <FormField id="sourcing" label="Sourcing %"><Input id="sourcing" name="sourcing" inputMode="decimal" defaultValue={current.sourcing} /></FormField>
        <FormField id="jobOwner" label="Job owner %"><Input id="jobOwner" name="jobOwner" inputMode="decimal" defaultValue={current.jobOwner} /></FormField>
        <FormField id="platform" label="Platform %"><Input id="platform" name="platform" inputMode="decimal" defaultValue={current.platform} /></FormField>
      </div>
      <FormMessage state={state} />
      <SubmitButton variant="secondary" className="justify-self-start">Publish new version</SubmitButton>
    </ActionForm>
  );
}
