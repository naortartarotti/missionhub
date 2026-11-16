"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Panel } from "@/components/shared/card";
import { SectionTitle } from "@/components/shared/page-header";
import { NetworkRules, Row, TermsSummary } from "@/features/jobs/components/terms-summary";
import { shareAtHire, termsFromRow, type SplitView } from "@/features/jobs/terms-display";
import { useFormatter, useGlobalT, useT } from "@/i18n/client";
import { commissionRuleLabel } from "@/lib/labels";
import type { getReferralTerms } from "../queries";
import { confirmAgreement } from "../actions";

/** `getReferralTerms` (backend.md §4.4): null = not visible, `recorded: false` = legacy referral. */
export type ReferralTerms = NonNullable<Awaited<ReturnType<typeof getReferralTerms>>>;
type Recorded = Extract<ReferralTerms, { recorded: true }>;

/** The snapshot rule as the referral's split: internal referrals give the sourcing part to the job owner (BR-16). */
function snapshotSplit(t: Recorded): SplitView {
  const r = t.rule;
  return t.internal
    ? { ruleName: r.name, ruleVersion: r.version, sourcingBps: 0, jobOwnerBps: r.sourcing_bps + r.job_owner_bps, platformBps: r.platform_bps }
    : { ruleName: r.name, ruleVersion: r.version, sourcingBps: r.sourcing_bps, jobOwnerBps: r.job_owner_bps, platformBps: r.platform_bps };
}

/**
 * Expected share (BR-36, PD-051 Q4): the frozen estimate × the snapshot sourcing share, identical for
 * both sides. Exact on flat, "~" on % bases; without a frozen estimate, the share and fee rate as text.
 * Never the live job, band, share_salary or current default rule.
 */
export function ExpectedShareRow({ terms, side }: { terms: Recorded; side: "source" | "target" }) {
  const t = useT("jobs");
  const tg = useGlobalT();
  const f = useFormatter();
  const label = side === "source" ? t("terms.rows.expectedShare") : t("terms.rows.expectedShareTarget");
  const value = terms.internal
    ? t("terms.internalShare")
    : terms.expectedShareMinor !== null
      ? f.money(terms.expectedShareMinor, terms.effective.currency, { code: true, approx: terms.feeBasis !== "flat" })
      : shareAtHire(terms.shareBps, { feeBasis: terms.feeBasis, rateBps: terms.rateBps }, tg, f);
  return <Row label={label}>{value}</Row>;
}

/** Header line: "Terms version {n} · {date}", or "Amended on {date}…" with the original in a disclosure. */
function VersionLine({ terms }: { terms: Recorded }) {
  const t = useT("jobs");
  const f = useFormatter();
  if (terms.amended) return <p className="text-xs text-muted-foreground">{t("terms.amendedLine", { date: f.date(terms.effective.created_at) })}</p>;
  return <p className="text-xs text-muted-foreground">{t("terms.versionLine", { version: terms.snapshot.version_no, date: f.date(terms.snapshot.created_at) })}</p>;
}

function NotRecorded() {
  const t = useT("jobs");
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      {t("terms.notRecorded")}
    </p>
  );
}

/** S6 Terms panel, both sides, above the agreement panel. */
export function ReferralTermsPanel({
  terms,
  side,
  placement,
  noSplit = false,
}: {
  terms: ReferralTerms;
  side: "source" | "target";
  /** QA-N3-08: a hire recorded without a split (N3 BR-11): no split and no expected share, only the "no agreement" line. */
  noSplit?: boolean;
  /** S6-e: once a hire is reported, the computed and invoiced fees replace the expected share. */
  placement?: { href: string; currency: string; invoicedMinor: number; computedMinor: number | null } | null;
}) {
  const tr = useT("referrals");
  const t = useT("jobs");
  const tc = useT("commissions");
  const f = useFormatter();
  const hired = terms.recorded && placement && placement.computedMinor !== null ? placement : null;
  return (
    <Panel className="p-6">
      <SectionTitle>{tr("detail.terms.title")}</SectionTitle>
      {!terms.recorded ? (
        <NotRecorded />
      ) : (
        <div className="grid gap-4">
          <div className="-mt-2 grid gap-1">
            <VersionLine terms={terms} />
            {/* AC-64: the job moved on; this referral keeps its own version (both sides). */}
            {terms.jobCurrentVersionNo !== null && terms.jobCurrentVersionNo > terms.snapshot.version_no ? (
              <p className="text-xs text-muted-foreground">
                {terms.amended
                  ? tr("detail.terms.newerOnJobAmended", { current: terms.jobCurrentVersionNo })
                  : tr("detail.terms.newerOnJob", { current: terms.jobCurrentVersionNo, version: terms.snapshot.version_no })}
              </p>
            ) : null}
          </div>
          <TermsSummary
            variant="referral"
            terms={termsFromRow(terms.effective)}
            split={noSplit ? null : snapshotSplit(terms)}
            amountShown={!noSplit && (terms.expectedShareMinor !== null || hired !== null)}
            extraRows={
              noSplit ? (
                <Row label={tr("detail.agreement.title")}>{tr("detail.agreement.none")}</Row>
              ) : hired ? (
                <Row label={tc("detail.fee.title")}>
                  {tr("detail.terms.placementLine", { computed: f.money(hired.computedMinor, hired.currency, { code: true }), invoiced: f.money(hired.invoicedMinor, hired.currency, { code: true }) })}
                  <Link href={hired.href} className="mt-1 inline-flex min-h-11 w-fit items-center text-xs font-medium underline underline-offset-4 sm:min-h-0">{tr("detail.agreement.openPlacement")}</Link>
                </Row>
              ) : (
                <ExpectedShareRow terms={terms} side={side} />
              )
            }
          />
          {terms.amended ? (
            <details className="group rounded-2xl border border-border/60">
              <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium focus-visible:outline-2">{t("terms.originalTerms")}</summary>
              <div className="px-3 pb-3">
                <p className="mb-3 text-xs text-muted-foreground">{t("terms.versionLine", { version: terms.snapshot.version_no, date: f.date(terms.snapshot.created_at) })}</p>
                <TermsSummary variant="compact" terms={termsFromRow(terms.snapshot)} />
              </div>
            </details>
          ) : null}
          <NetworkRules collapsible />
        </div>
      )}
    </Panel>
  );
}

/**
 * S7: the sourcing side confirms the agreement on the same terms and split as the referral page
 * (BR-16, BR-36). Replaces the generic ConfirmDialog. Errors stay inline and keep the dialog open.
 */
export function AgreementDialog({
  orgSlug,
  referralId,
  terms,
  agreement,
}: {
  orgSlug: string;
  referralId: string;
  terms: ReferralTerms | null;
  /** The agreement awaiting confirmation (its split is the snapshot rule for snapshot referrals). */
  agreement: { sourcing_bps: number; job_owner_bps: number; platform_bps: number; rule_name: string; rule_version: number };
}) {
  const tr = useT("referrals");
  const tc = useT("common");
  const t = useT("jobs");
  const tg = useGlobalT();
  const f = useFormatter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const recorded = terms?.recorded ? terms : null;
  const split: SplitView = { ruleName: agreement.rule_name, ruleVersion: agreement.rule_version, sourcingBps: agreement.sourcing_bps, jobOwnerBps: agreement.job_owner_bps, platformBps: agreement.platform_bps };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button className="min-h-11 w-full sm:min-h-10 sm:w-auto">{tr("agreement.trigger")}</Button>
      </DialogTrigger>
      <DialogContent
        className="flex max-h-[90dvh] flex-col gap-0 rounded-3xl p-0 sm:max-w-lg"
        onOpenAutoFocus={(e) => {
          // Focus starts on the title (spec §6): the dialog commits the sourcing side.
          e.preventDefault();
          titleRef.current?.focus();
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-4 text-left">
          <DialogTitle ref={titleRef} tabIndex={-1} className="pr-8 leading-snug outline-none">{tr("agreement.title")}</DialogTitle>
          <DialogDescription>{recorded ? tr("agreement.descriptionSnapshot") : tr("agreement.description")}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
          {recorded ? (
            <div className="grid gap-3">
              <VersionLine terms={recorded} />
              <TermsSummary
                variant="compact"
                terms={termsFromRow(recorded.effective)}
                split={split}
                amountShown={recorded.expectedShareMinor !== null}
                extraRows={<ExpectedShareRow terms={recorded} side="source" />}
              />
            </div>
          ) : (
            <div className="grid gap-3">
              <dl className="grid gap-3">
                <Row label={t("terms.rows.split")}>
                  {t("terms.split", { sourcing: f.percent(split.sourcingBps), hiring: f.percent(split.jobOwnerBps), platform: f.percent(split.platformBps) })}
                  <span className="block text-xs font-normal text-muted-foreground">{t("terms.splitRule", { rule: commissionRuleLabel(split.ruleName, tg), version: String(split.ruleVersion) })}</span>
                </Row>
              </dl>
              <NotRecorded />
            </div>
          )}
          {error ? (
            <p role="alert" className="mt-4 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter className="border-t border-border/60 px-6 py-4">
          <Button variant="outline" className="min-h-11 sm:min-h-10" onClick={() => setOpen(false)}>
            {tc("actions.cancel")}
          </Button>
          <Button
            className="min-h-11 sm:min-h-10"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await confirmAgreement(orgSlug, referralId);
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                if (r.message) toast.success(r.message);
                setOpen(false);
              })
            }
          >
            {pending ? tc("actions.working") : tr("agreement.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
