"use client";

import { ActionForm } from "@/components/shared/action-form";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormField } from "@/components/shared/form-field";
import { FormMessage } from "@/components/shared/form-message";
import { SubmitButton } from "@/components/shared/submit-button";
import { publishRule, resolveDispute, setSuspension, setWalletCashoutsEnabled, setWalletFrozen, setWalletTransfersEnabled } from "../actions";
import { useT } from "@/i18n/client";

export function SuspendButton({ orgId, suspended }: { orgId: string; suspended: boolean }) {
  const t = useT("admin");
  return suspended ? (
    <ConfirmDialog trigger={<Button size="sm" variant="outline">{t("suspension.reinstate")}</Button>} title={t("suspension.reinstateTitle")} description={t("suspension.reinstateDescription")} confirmLabel={t("suspension.reinstate")} onConfirm={() => setSuspension({ orgId, suspend: false, reason: "" })} />
  ) : (
    <ConfirmDialog
      trigger={<Button size="sm" variant="outline">{t("suspension.suspend")}</Button>}
      title={t("suspension.suspendTitle")}
      description={t("suspension.suspendDescription")}
      confirmLabel={t("suspension.suspend")}
      destructive
      reasonLabel={t("suspension.reason")}
      reasonRequired
      onConfirm={(reason) => setSuspension({ orgId, suspend: true, reason })}
    />
  );
}

export function DisputeResolution({ disputeId }: { disputeId: string }) {
  const t = useT("admin");
  return (
    <div className="flex gap-2">
      <ConfirmDialog trigger={<Button size="sm">{t("dispute.resolve")}</Button>} title={t("dispute.resolveTitle")} description={t("dispute.resolveDescription")} confirmLabel={t("dispute.resolve")} reasonLabel={t("dispute.resolution")} reasonRequired onConfirm={(r) => resolveDispute({ disputeId, upheld: true, resolution: r })} />
      <ConfirmDialog trigger={<Button size="sm" variant="outline">{t("dispute.reject")}</Button>} title={t("dispute.rejectTitle")} description={t("dispute.rejectDescription")} confirmLabel={t("dispute.reject")} reasonLabel={t("dispute.reason")} reasonRequired onConfirm={(r) => resolveDispute({ disputeId, upheld: false, resolution: r })} />
    </div>
  );
}

export function RuleForm({ current }: { current: { sourcing: number; jobOwner: number; platform: number } }) {
  const t = useT("admin");
  const [state, action] = useActionState(publishRule, null);
  return (
    <ActionForm action={action} className="grid gap-4">
      <input type="hidden" name="name" value="Standard marketplace split" />
      <div className="grid grid-cols-3 gap-3">
        <FormField id="sourcing" label={t("rules.sourcing")}><Input id="sourcing" name="sourcing" inputMode="decimal" defaultValue={current.sourcing} /></FormField>
        <FormField id="jobOwner" label={t("rules.jobOwner")}><Input id="jobOwner" name="jobOwner" inputMode="decimal" defaultValue={current.jobOwner} /></FormField>
        <FormField id="platform" label={t("rules.platform")}><Input id="platform" name="platform" inputMode="decimal" defaultValue={current.platform} /></FormField>
      </div>
      <FormMessage state={state} />
      <SubmitButton variant="secondary" className="justify-self-start">{t("rules.publish")}</SubmitButton>
    </ActionForm>
  );
}

export function WalletFreezeButton({ orgId, frozen }: { orgId: string; frozen: boolean }) {
  const t = useT("admin");
  return frozen ? (
    <ConfirmDialog trigger={<Button size="sm" variant="outline">{t("wallets.freeze.unfreeze")}</Button>} title={t("wallets.freeze.unfreezeTitle")} description={t("wallets.freeze.unfreezeDescription")} confirmLabel={t("wallets.freeze.unfreeze")} onConfirm={() => setWalletFrozen({ orgId, frozen: false, reason: "" })} />
  ) : (
    <ConfirmDialog
      trigger={<Button size="sm" variant="outline">{t("wallets.freeze.freeze")}</Button>}
      title={t("wallets.freeze.freezeTitle")}
      description={t("wallets.freeze.freezeDescription")}
      confirmLabel={t("wallets.freeze.freeze")}
      destructive
      reasonLabel={t("suspension.reason")}
      reasonRequired
      onConfirm={(reason) => setWalletFrozen({ orgId, frozen: true, reason })}
    />
  );
}

export function WalletTransfersSwitch({ enabled }: { enabled: boolean }) {
  const t = useT("admin");
  return enabled ? (
    <ConfirmDialog trigger={<Button size="sm" variant="outline">{t("wallets.transfers.disable")}</Button>} title={t("wallets.transfers.disableTitle")} description={t("wallets.transfers.disableDescription")} confirmLabel={t("wallets.transfers.disable")} onConfirm={() => setWalletTransfersEnabled({ enabled: false })} />
  ) : (
    <ConfirmDialog trigger={<Button size="sm" variant="outline">{t("wallets.transfers.enable")}</Button>} title={t("wallets.transfers.enableTitle")} description={t("wallets.transfers.enableDescription")} confirmLabel={t("wallets.transfers.enable")} destructive onConfirm={() => setWalletTransfersEnabled({ enabled: true })} />
  );
}

export function WalletCashoutsSwitch({ enabled }: { enabled: boolean }) {
  const t = useT("admin");
  return enabled ? (
    <ConfirmDialog trigger={<Button size="sm" variant="outline">{t("wallets.cashouts.disable")}</Button>} title={t("wallets.cashouts.disableTitle")} description={t("wallets.cashouts.disableDescription")} confirmLabel={t("wallets.cashouts.disable")} onConfirm={() => setWalletCashoutsEnabled({ enabled: false })} />
  ) : (
    <ConfirmDialog trigger={<Button size="sm" variant="outline">{t("wallets.cashouts.enable")}</Button>} title={t("wallets.cashouts.enableTitle")} description={t("wallets.cashouts.enableDescription")} confirmLabel={t("wallets.cashouts.enable")} destructive onConfirm={() => setWalletCashoutsEnabled({ enabled: true })} />
  );
}
