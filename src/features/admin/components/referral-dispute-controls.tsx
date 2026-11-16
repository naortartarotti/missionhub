"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Download, Loader2, Minus, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusPill, type Tone } from "@/components/shared/status-pill";
import { useGlobalT, useT } from "@/i18n/client";
import { compareDisputeContacts, getAdminClaimEvidenceUrl, resolvePriorPresentationDispute, type ContactMatch } from "../actions";

/** Uphold / reject a contested prior-presentation objection (BR-18), each with a written resolution both orgs read. */
export function ClaimDisputeResolution({ disputeId, target }: { disputeId: string; target: string }) {
  const t = useT("admin");
  const resolution = (description: string) => (
    <div className="grid gap-2">
      <p>{description}</p>
      <p>{t("dispute.resolutionVisible")}</p>
    </div>
  );
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmDialog
        trigger={<Button size="sm" className="min-h-11 sm:min-h-8">{t("dispute.upholdClaim")}</Button>}
        title={t("dispute.upholdTitle")}
        description={resolution(t("dispute.upholdDescription"))}
        confirmLabel={t("dispute.upholdClaim")}
        reasonLabel={t("dispute.resolution")}
        reasonRequired
        reasonMinLength={5}
        reasonMaxLength={2000}
        reasonTooShort={t("validation.resolution")}
        onConfirm={(r) => resolvePriorPresentationDispute({ disputeId, claimUpheld: true, resolution: r })}
      />
      <ConfirmDialog
        trigger={<Button size="sm" variant="outline" className="min-h-11 sm:min-h-8">{t("dispute.rejectClaim")}</Button>}
        title={t("dispute.rejectClaimTitle")}
        description={resolution(t("dispute.rejectClaimDescription", { target }))}
        confirmLabel={t("dispute.rejectClaim")}
        reasonLabel={t("dispute.resolution")}
        reasonRequired
        reasonMinLength={5}
        reasonMaxLength={2000}
        reasonTooShort={t("validation.resolution")}
        onConfirm={(r) => resolvePriorPresentationDispute({ disputeId, claimUpheld: false, resolution: r })}
      />
    </div>
  );
}

/** Admin evidence download (PD-024): 60-second signed URL, audited per file; only offered on disputed claims. */
export function AdminEvidenceDownload({ fileId, name, ready }: { fileId: string; name: string; ready: boolean }) {
  const t = useT("admin");
  const tg = useGlobalT();
  const [pending, start] = useTransition();
  if (!ready) return <span className="shrink-0 text-xs text-muted-foreground">{tg("referrals.claim.panel.scanning")}</span>;
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-11 shrink-0 sm:size-10"
      aria-label={t("disputes.claim.download", { name })}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await getAdminClaimEvidenceUrl(fileId);
          if (r.ok && r.data) window.location.assign(r.data.url);
          else if (!r.ok) toast.error(r.error);
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Download className="size-4" aria-hidden />}
    </Button>
  );
}

const MATCH: Record<ContactMatch, { tone: Tone; icon: LucideIcon }> = {
  match: { tone: "success", icon: Check },
  no_match: { tone: "neutral", icon: X },
  not_available: { tone: "neutral", icon: Minus },
};

/**
 * "Same person" block (PD-024), referral-evidence disputes only: per channel, same / different /
 * not available. Never values, hashes or which side lacked one. Each load is audited server-side.
 */
export function SamePersonBlock({ disputeId }: { disputeId: string }) {
  const t = useT("admin");
  const tg = useGlobalT();
  const [state, setState] = useState<{ status: "loading" } | { status: "error" } | { status: "ready"; data: Record<"email" | "phone" | "linkedin", ContactMatch> }>({ status: "loading" });
  const [, start] = useTransition();
  const load = useCallback(() => {
    start(async () => {
      setState({ status: "loading" });
      const r = await compareDisputeContacts(disputeId);
      setState(r.ok && r.data ? { status: "ready", data: r.data } : { status: "error" });
    });
  }, [disputeId]);
  useEffect(() => load(), [load]);

  const rows = [
    { key: "email", label: t("disputes.claim.samePersonEmail") },
    { key: "phone", label: t("disputes.claim.samePersonPhone") },
    { key: "linkedin", label: t("disputes.claim.samePersonLinkedin") },
  ] as const;
  return (
    <div className="grid gap-2 rounded-2xl border border-border/60 p-3">
      <h4 className="text-sm font-semibold">{t("disputes.claim.samePerson")}</h4>
      {state.status === "loading" ? (
        <div className="grid gap-2" aria-busy>
          {rows.map((r) => <Skeleton key={r.key} className="h-6 w-full" />)}
        </div>
      ) : state.status === "error" ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-danger">
          <span>{t("disputes.claim.samePersonError")}</span>
          <Button size="sm" variant="outline" className="min-h-11 sm:min-h-8" onClick={load}>{tg("common.actions.tryAgain")}</Button>
        </div>
      ) : (
        <dl className="grid gap-2 text-sm">
          {rows.map((r) => {
            const v = state.data[r.key];
            const m = MATCH[v];
            return (
              <div key={r.key} className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-muted-foreground">{r.label}</dt>
                <dd>
                  <StatusPill tone={m.tone} icon={m.icon} label={tg(`labels.identifierMatch.${v}`)} className={v === "not_available" ? "text-xs text-muted-foreground" : "text-xs"} />
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
