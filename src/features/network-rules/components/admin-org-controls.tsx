"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useT } from "@/i18n/client";
import { closeStaleReferral, liftSanction } from "../admin-actions";

/**
 * S19 lift controls (replace the removed SuspendButton, BR-29): Lift… for a hold or a suspension
 * (legacy pre-N10 suspension: no sanction id), Lift termination… for an admin other than the decider.
 * Reason required, kept in the audit log (admin-only).
 */
export function LiftSanctionButton({ orgId, orgName, kind, sanctionId }: { orgId: string; orgName: string; kind: "hold" | "suspension" | "termination"; sanctionId: string | null }) {
  const t = useT("admin");
  const router = useRouter();
  const title = kind === "hold" ? t("orgDetail.liftHoldTitle", { org: orgName }) : kind === "suspension" ? t("orgDetail.liftSuspensionTitle", { org: orgName }) : t("orgDetail.liftTerminationTitle", { org: orgName });
  const description = kind === "hold" ? t("orgDetail.liftHoldDescription") : kind === "suspension" ? t("orgDetail.liftSuspensionDescription") : t("orgDetail.liftTerminationDescription");
  const confirmLabel = kind === "hold" ? t("orgDetail.liftHoldConfirm") : kind === "suspension" ? t("orgDetail.liftSuspensionConfirm") : t("orgDetail.liftTerminationConfirm");
  const done = kind === "hold" ? t("orgDetail.holdLifted") : kind === "suspension" ? t("orgDetail.suspensionLifted") : t("orgDetail.terminationLifted");
  return (
    <ConfirmDialog
      trigger={<Button variant="outline" size="sm" className="min-h-11 sm:min-h-8">{kind === "termination" ? t("orgDetail.liftTermination") : t("orgDetail.lift")}</Button>}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      reasonLabel={kind === "termination" ? t("orgDetail.liftTerminationReason") : t("orgDetail.liftReason")}
      reasonRequired
      reasonMinLength={5}
      reasonMaxLength={2000}
      reasonTooShort={t("validation.reason")}
      destructive={kind === "termination"}
      onConfirm={async (reason) => {
        const r = await liftSanction({ orgId, sanctionId, reason });
        if (r.ok) {
          toast.success(done);
          router.refresh();
          return;
        }
        return r.code === "lift_not_allowed" ? { ...r, error: t("orgDetail.errors.liftNotAllowed") } : r;
      }}
    />
  );
}

/** S27 (RD-047): close a referral of a terminated org inactive for 60+ days, as cancelled. */
export function CloseStaleButton({ referralId }: { referralId: string }) {
  const t = useT("admin");
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={<Button variant="outline" size="sm" className="min-h-11 sm:min-h-8">{t("orgDetail.closeStale")}</Button>}
      title={t("orgDetail.closeStaleTitle")}
      description={t("orgDetail.closeStaleDescription")}
      confirmLabel={t("orgDetail.closeStaleConfirm")}
      reasonLabel={t("orgDetail.closeStaleReason")}
      reasonRequired
      reasonMinLength={5}
      reasonMaxLength={2000}
      reasonTooShort={t("validation.reason")}
      destructive
      onConfirm={async (reason) => {
        const r = await closeStaleReferral({ referralId, reason });
        if (r.ok) {
          toast.success(t("orgDetail.staleClosed"));
          router.refresh();
          return;
        }
        return r.code === "not_stale" ? { ...r, error: t("orgDetail.errors.notStale") } : r.code === "not_terminated" ? { ...r, error: t("orgDetail.errors.notTerminated") } : r;
      }}
    />
  );
}
