import Link from "next/link";
import { notFound } from "next/navigation";
import { getRequestContext } from "@/server/auth/context";
import { getPlacement, getPlacementFeeState } from "@/features/commissions/queries";
import { BusinessDeadline } from "@/features/referrals/components/business-deadline";
import { ledgerBalances, projectedSplit } from "@/features/commissions/domain";
import { DisputeButton, EvidenceDialog, InvoiceDialog, ReviewEvidenceButtons } from "@/features/commissions/components/finance-forms";
import { Panel } from "@/components/shared/card";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { Flash } from "@/components/shared/flash";
import { Button } from "@/components/ui/button";
import { PLACEMENT_STATUS, commissionRuleLabel } from "@/lib/labels";
import { minorToMajorString } from "@/lib/money/format";
import { computeFee, type FeeDifferenceReason } from "@/lib/money/terms";
import { feeShort } from "@/features/jobs/terms-display";
import { Clock, Info } from "lucide-react";
import { getReferralTerms } from "@/features/referrals/queries";
import { feePendingEstimate, isInvoiceOverdue } from "@/features/commissions/placement-signals";
import { FeeDetailsDialog } from "@/features/commissions/components/fee-details-dialog";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";

/** Server-rendered per request, so reading the clock here is fine. */
const isPast = (iso: string) => new Date(iso).getTime() < Date.now();

export async function generateMetadata() {
  return { title: (await getT("commissions"))("detail.metaTitle") };
}

export default async function PlacementPage({ params, searchParams }: PageProps<"/workspace/[orgSlug]/commissions/[placementId]">) {
  const { orgSlug, placementId } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(orgSlug, { allowSettlement: true });
  const d = await getPlacement(ctx, placementId);
  if (!d) notFound();
  const [t, tg, f] = await Promise.all([getT("commissions"), getGlobalT(), getFormatter()]);
  const pct = (bps: number) => new Intl.NumberFormat(f.tag, { style: "percent", minimumFractionDigits: bps % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(bps / 10000);
  const { placement: p, side } = d;
  const a = p.agreement!;
  // N3 (BR-31): a fee-pending placement may have no currency or fee yet; amounts then render as "—".
  const cur = p.currency ?? "";
  const feePending = p.contracted_fee_minor === null;
  // BR-31: the referral's frozen terms give the estimate (legacy: none) and the fee-details form's variant.
  // backend.md v2 §21: the deadline with server business days left, and the PD-077 start-date window.
  const [pendingTerms, feeState] = feePending && p.referral?.id
    ? await Promise.all([getReferralTerms(ctx, p.referral.id), getPlacementFeeState(ctx, p.id)])
    : [null, null];
  const invoiceOverdue = isInvoiceOverdue({ invoice_due_at: p.invoice_due_at, invoiceCount: d.invoices.length });
  const b = ledgerBalances(d.ledger);
  // N2 (BR-27): with C, the sourcing share is floored at the computed fee and the job owner can go below 0.
  const proj = projectedSplit(p.contracted_fee_minor, a, p.computed_fee_minor);
  const money = (v: number | null | undefined, c = cur) => f.money(v, c, { code: true });
  const differs = p.computed_fee_minor !== null && p.computed_fee_minor !== p.contracted_fee_minor;
  const partnerName = (side === "source" ? p.target_org?.name : p.source_org?.name) ?? "";
  const st = PLACEMENT_STATUS[p.status];
  const locked = ["settled", "cancelled", "disputed"].includes(p.status);
  const openDispute = d.disputes.find((x) => x.status === "open");
  const payable = ["commission_payable", "payment_partially_verified"].includes(p.status);

  /**
   * S9 Fee-pending panel (BR-31, spec §2.4): the hire counts, the fee details aren't in yet. The estimate line is
   * labelled as an estimate; MissionHub never invents a fee. B gets **Enter fee details** while the status is
   * `fee_pending` (a dispute opened from it keeps the panel, without the button).
   */
  function feePendingPanel() {
    const est = feePendingEstimate(pendingTerms, t, f);
    const due = feeState?.fee_details_due_at ?? p.fee_details_due_at;
    const overdue = feeState ? feeState.fee_details_overdue : !!due && isPast(due);
    return (
      <Panel className="grid gap-4">
        <SectionTitle>{t("feePending.title")}</SectionTitle>
        <div className="-mt-2 grid gap-3 text-sm">
          <p className={est.legacy ? "flex items-start gap-2 text-pretty text-muted-foreground" : "font-medium text-pretty tabular-nums"}>
            {est.legacy ? <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
            {est.text}
          </p>
          {p.established_at && (p.established_how === "deemed" || p.established_how === "upheld") ? (
            <p className="text-pretty">{t("feePending.established", { date: f.date(p.established_at), how: t(`feePending.how.${p.established_how}`) })}</p>
          ) : null}
        </div>
        {due ? (
          overdue ? (
            // Design B-2 (AA): foreground text on the soft warning pair; the icon carries the colour.
            <p className="flex items-start gap-2 rounded-2xl bg-warning-soft px-3.5 py-2.5 text-sm text-pretty text-foreground"><Clock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />{t("feePending.overdue", { when: f.etDateTime(due) })}</p>
          ) : (
            <BusinessDeadline at={due} left={feeState?.fee_details_business_days_left ?? null} label={t("feePending.due")} />
          )
        ) : null}
        {side === "target" && p.status === "fee_pending" ? (
          <div className="flex sm:justify-end">
            <FeeDetailsDialog
              orgSlug={orgSlug}
              placementId={p.id}
              version={p.version}
              terms={pendingTerms}
              partner={partnerName}
              defaultCurrency={ctx.currency}
              knownStart={p.start_date}
              startMin={feeState?.start_date_min ?? null}
              startMax={feeState?.start_date_max ?? null}
            />
          </div>
        ) : null}
      </Panel>
    );
  }

  /** S9 Fee panel (BR-24): terms, reported salary, computed and invoiced fee, and the difference when they differ. */
  const feePanel = (() => {
    if (feePending) return feePendingPanel();
    const terms = p.terms;
    if (p.computed_fee_minor === null || !terms) {
      return (
        <Panel className="grid gap-2">
          <SectionTitle>{t("detail.fee.title")}</SectionTitle>
          <p className="-mt-2 text-sm font-medium tabular-nums">{t("detail.fee.legacyFee", { fee: money(p.contracted_fee_minor) })}</p>
          <p className="flex items-start gap-2 text-sm text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{tg("jobs.terms.notRecorded")}</p>
        </Panel>
      );
    }
    const pctBasis = terms.fee_basis !== "flat";
    const amount = (p.reported_base_minor ?? 0) + (p.reported_bonus_minor ?? 0);
    const raw = pctBasis ? computeFee({ feeBasis: terms.fee_basis, rateBps: terms.rate_bps, flatFeeMinor: null, minFeeMinor: null }, { baseMinor: p.reported_base_minor, bonusMinor: p.reported_bonus_minor }) : null;
    const breakdown = !pctBasis
      ? tg("referrals.hire.breakdownFlat")
      : terms.min_fee_minor !== null && raw !== null && raw < terms.min_fee_minor
        ? tg("referrals.hire.breakdownMinimum")
        : tg("referrals.hire.breakdownRate", { rate: f.percent(terms.rate_bps ?? 0), amount: money(amount) });
    const lower = differs && (p.contracted_fee_minor ?? 0) < (p.computed_fee_minor ?? 0);
    return (
      <Panel className="grid gap-4">
        <SectionTitle>{t("detail.fee.title")}</SectionTitle>
        <dl className="-mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">{t("detail.fee.terms")}</dt>
            <dd className="mt-0.5 text-sm font-medium text-pretty">
              {terms.kind === "amendment" ? t("detail.fee.amended", { date: f.date(terms.created_at) }) : t("detail.fee.version", { version: terms.version_no })}
              <span className="block font-normal text-muted-foreground">{feeShort({ feeBasis: terms.fee_basis, rateBps: terms.rate_bps, flatFeeMinor: terms.flat_fee_minor, currency: terms.currency }, tg, f)}</span>
            </dd>
          </div>
          {pctBasis ? (
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{t("detail.fee.base")}</dt>
              <dd className="mt-0.5 text-sm font-medium tabular-nums">
                {money(p.reported_base_minor)}
                {terms.fee_basis === "pct_total_cash" ? <span className="block font-normal text-muted-foreground">{t("detail.fee.bonus", { amount: money(p.reported_bonus_minor ?? 0) })}</span> : null}
              </dd>
            </div>
          ) : null}
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">{t("detail.fee.computed")}</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums">
              {money(p.computed_fee_minor)}
              <span className="block text-xs font-normal text-muted-foreground">{breakdown}</span>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">{t("detail.fee.invoiced")}</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums">{money(p.contracted_fee_minor)}</dd>
          </div>
        </dl>
        {differs ? (
          <div className="grid gap-3">
            <p className="text-sm text-pretty">
              <span className="font-medium tabular-nums">{t("detail.fee.difference", { amount: f.money((p.contracted_fee_minor ?? 0) - (p.computed_fee_minor ?? 0), cur, { code: true, signed: true }) })}</span>
              {p.fee_difference_reason ? <> · {tg(`labels.feeDifferenceReason.${p.fee_difference_reason as FeeDifferenceReason}`)}</> : null}
              {" · "}
              <span className="text-muted-foreground">{p.fee_difference_note ? t("detail.fee.note", { note: p.fee_difference_note }) : t("detail.fee.noNote")}</span>
            </p>
            {/* Neutral callout (RD-031): no warning or danger tone, side-specific. */}
            <div role="status" className="flex items-start gap-2 rounded-2xl bg-muted/50 px-4 py-3 text-sm text-foreground">
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="grid gap-1 text-pretty">
                {!lower ? (
                  <p>{t("detail.fee.higher")}</p>
                ) : side === "source" ? (
                  <p>{t("detail.fee.lowerSource", { partner: partnerName, computed: money(p.computed_fee_minor) })}</p>
                ) : (
                  <>
                    <p>{t("detail.fee.lowerTarget", { partner: partnerName })}</p>
                    {proj && proj.jobOwner < 0 ? <p>{t("detail.fee.negativeTarget", { amount: money(proj.jobOwner), partner: partnerName })}</p> : null}
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </Panel>
    );
  })();

  return (
    // One shrinkable track: nothing below can widen the page past 375px (AC-62, AC-72).
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        eyebrow={side === "source" ? t("detail.sourcedFor", { org: p.target_org?.name ?? "" }) : t("detail.sourcedBy", { org: p.source_org?.name ?? "" })}
        title={p.referral?.job_title_snapshot}
        description={p.guarantee_until
          ? t("detail.subtitleGuarantee", { candidate: p.referral?.candidate_label ?? "", start: p.start_date ? f.date(p.start_date) : "—", guarantee: f.date(p.guarantee_until) })
          : t("detail.subtitle", { candidate: p.referral?.candidate_label ?? "", start: p.start_date ? f.date(p.start_date) : "—" })}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* fr « Détails des honoraires en attente » wraps to two lines, never truncated (spec §5.10). */}
            <StatusPill tone={st.tone} icon={p.status === "fee_pending" ? Clock : undefined} label={tg(`labels.placementStatus.${p.status}`)} wrap />
            {invoiceOverdue ? <StatusPill tone="warning" icon={Clock} label={t("invoiceOverdue")} wrap /> : null}
          </div>
        }
      />
      <p className="-mt-2 text-sm text-muted-foreground">{tg(`labels.placementStatusDescription.${p.status}`)}</p>
      {sp.created ? <Flash message={t("detail.flashCreated")} /> : null}

      {openDispute ? (
        <div role="status" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{t("detail.disputeOpen", { date: f.date(openDispute.created_at), reason: openDispute.reason })}</div>
      ) : null}

      {feePanel}

      {feePending ? <p className="-mb-2 text-sm text-pretty text-muted-foreground">{t("feePending.noAmounts")}</p> : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3">
        {([
          ["sourcing", a.sourcing_bps, proj?.sourcing ?? null, b.sourcingAllocated, b.sourcingOutstanding, side === "source"],
          ["job_owner", a.job_owner_bps, proj?.jobOwner ?? null, b.jobOwnerAllocated, null, side === "target"],
          ["platform", a.platform_bps, proj?.platform ?? null, b.platformAllocated, b.platformOutstanding, false],
        ] as const).map(([label, bps, projected, allocated, outstanding, you]) => (
          <Panel key={label} className={you ? "ring-2 ring-foreground" : ""}>
            <p className="text-sm text-muted-foreground">{t(you ? "detail.shareYou" : "detail.share", { party: t(`party.${label}`), percent: pct(bps) })}</p>
            {/* A negative job-owner share is an obligation, not an error: minus sign from the formatter, no danger colour. */}
            <p className="mt-2 text-2xl font-semibold tabular-nums" aria-describedby={((b.received ? allocated : projected) ?? 0) < 0 ? `neg-${label}` : undefined}>{money(b.received ? allocated : projected)}</p>
            <p className="text-xs text-muted-foreground">{b.received ? t("detail.allocated") : t("detail.projected")}</p>
            {((b.received ? allocated : projected) ?? 0) < 0 ? <p id={`neg-${label}`} className="mt-1 text-xs text-muted-foreground">{t("detail.negativeShareHint")}</p> : null}
            {label === "platform" && differs ? <p className="mt-1 text-xs text-muted-foreground">{t(`detail.platformBasis.${a.platform_basis ?? "collected"}`)}</p> : null}
            {outstanding !== null && b.received ? <p className="mt-2 text-sm">{t("detail.outstanding")} <span className="font-medium tabular-nums">{money(outstanding)}</span></p> : null}
          </Panel>
        ))}
      </div>

      <Panel className="flex flex-wrap items-center gap-2">
        {side === "target" && !locked && !feePending ? (
          <>
            <InvoiceDialog orgSlug={orgSlug} placementId={p.id} currency={cur} defaultAmount={minorToMajorString(p.contracted_fee_minor ?? 0, cur)} />
            {d.invoices.length ? <EvidenceDialog orgSlug={orgSlug} placementId={p.id} currency={cur} kinds={["client_payment", "client_refund"]} label={t("detail.recordClientPayment")} /> : null}
            {payable ? (
              <EvidenceDialog orgSlug={orgSlug} placementId={p.id} currency={cur} kinds={["sourcing_payout", "platform_remittance"]} label={t("detail.recordPayout")} />
            ) : null}
          </>
        ) : null}
        {!locked ? <DisputeButton orgSlug={orgSlug} placementId={p.id} /> : null}
        <Button variant="ghost" asChild><Link href={`/workspace/${orgSlug}/referrals/${p.referral?.id}`}>{t("detail.openReferral")}</Link></Button>
        <p className="ml-auto text-xs text-muted-foreground">{t("detail.agreement", { rule: commissionRuleLabel(a.rule_name, tg), version: String(a.rule_version), terms: a.terms_version })}</p>
      </Panel>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
        <Panel>
          <SectionTitle>{t("detail.invoicesTitle")}</SectionTitle>
          {d.invoices.length === 0 && d.evidence.length === 0 ? <p className="text-sm text-muted-foreground">{t("detail.nothingRecorded")}</p> : null}
          <ul className="grid gap-3">
            {d.invoices.map((i) => (
              <li key={i.id} className="rounded-2xl border border-border p-4 text-sm">
                <p className="font-medium">{t("detail.invoice", { number: i.invoice_number })}</p>
                <p className="text-muted-foreground">{i.due_on
                    ? t("detail.invoiceLineDue", { amount: money(i.amount_minor, i.currency), tax: money(i.tax_minor, i.currency), issued: f.date(i.issued_on), due: f.date(i.due_on) })
                    : t("detail.invoiceLine", { amount: money(i.amount_minor, i.currency), tax: money(i.tax_minor, i.currency), issued: f.date(i.issued_on) })}</p>
              </li>
            ))}
            {d.evidence.map((e) => {
              const canReview = e.status === "pending" && e.kind === "sourcing_payout" && side === "source" && e.recorded_by !== ctx.userId;
              return (
                <li key={e.id} className="rounded-2xl border border-border p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{tg(`labels.evidenceKind.${e.kind}`)}</p>
                    <StatusPill tone={e.status === "verified" ? "success" : e.status === "rejected" ? "danger" : "warning"} label={t(`detail.evidenceStatus.${e.status}`)} />
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {e.processing_fee_minor
                      ? t("detail.evidenceLineFees", { amount: money(e.amount_minor, e.currency), fees: money(e.processing_fee_minor, e.currency), date: f.date(e.occurred_on), reference: e.reference })
                      : t("detail.evidenceLine", { amount: money(e.amount_minor, e.currency), date: f.date(e.occurred_on), reference: e.reference })}
                  </p>
                  {e.review_note ? <p className="mt-1 text-muted-foreground">{t("detail.review", { note: e.review_note })}</p> : null}
                  {e.status === "pending" && !canReview ? (
                    <p className="mt-2 text-xs text-muted-foreground">{e.kind === "sourcing_payout" ? t("detail.sourcingConfirms") : t("detail.platformVerifies")}</p>
                  ) : null}
                  {canReview ? <div className="mt-3"><ReviewEvidenceButtons evidenceId={e.id} orgSlug={orgSlug} placementId={p.id} /></div> : null}
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel>
          <SectionTitle>{t("detail.ledger")}</SectionTitle>
          {d.ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("detail.ledgerEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{t("detail.ledgerCaption")}</caption>
                <thead><tr className="border-b border-border text-left text-muted-foreground"><th scope="col" className="py-2 font-medium">{t("detail.entry")}</th><th scope="col" className="py-2 font-medium">{t("detail.partyColumn")}</th><th scope="col" className="py-2 text-right font-medium">{t("detail.amount")}</th></tr></thead>
                <tbody>
                  {d.ledger.map((l) => (
                    <tr key={l.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2"><span className="capitalize">{t(`detail.entryType.${l.entry_type}`)}</span><span className="block text-xs text-muted-foreground">{f.date(l.created_at)}{l.memo ? ` · ${l.memo}` : ""}</span></td>
                      <td className="py-2">{t(`party.${l.party}`)}</td>
                      {/* Reversals and payouts are muted; a negative job-owner allocation (I < C) isn't a reversal. */}
                      <td className={`py-2 text-right tabular-nums ${l.amount_minor < 0 && l.entry_type !== "allocation" ? "text-muted-foreground" : ""}`}>{money(l.amount_minor, l.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h3 className="mt-6 mb-2 text-sm font-semibold">{t("detail.statusHistory")}</h3>
          <ol className="grid gap-1.5 text-sm">
            {d.events.map((e) => <li key={e.id} className="flex justify-between gap-3"><span>{tg(`labels.placementStatus.${e.to_status}`)}{e.reason ? <span className="text-muted-foreground"> · {e.reason}</span> : null}</span><span className="text-muted-foreground">{f.date(e.created_at)}</span></li>)}
          </ol>
        </Panel>
      </div>
    </div>
  );
}
