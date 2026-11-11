import Link from "next/link";
import { notFound } from "next/navigation";
import { getRequestContext } from "@/server/auth/context";
import { integrations } from "@/server/env";
import { PayCommissionButton } from "@/features/wallet/components/wallet-actions";
import { getPlacement } from "@/features/commissions/queries";
import { ledgerBalances, projectedSplit } from "@/features/commissions/domain";
import { DisputeButton, EvidenceDialog, InvoiceDialog, ReviewEvidenceButtons } from "@/features/commissions/components/finance-forms";
import { Panel } from "@/components/shared/card";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { Flash } from "@/components/shared/flash";
import { Button } from "@/components/ui/button";
import { PLACEMENT_STATUS } from "@/lib/labels";
import { minorToMajorString } from "@/lib/money/format";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("commissions"))("detail.metaTitle") };
}

export default async function PlacementPage({ params, searchParams }: PageProps<"/workspace/[orgSlug]/wallet/placements/[placementId]">) {
  const { orgSlug, placementId } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(orgSlug);
  const d = await getPlacement(ctx, placementId);
  if (!d) notFound();
  const [t, tg, f] = await Promise.all([getT("commissions"), getGlobalT(), getFormatter()]);
  const pct = (bps: number) => new Intl.NumberFormat(f.tag, { style: "percent", minimumFractionDigits: bps % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(bps / 10000);
  const { placement: p, side } = d;
  const a = p.agreement!;
  const cur = p.currency;
  const b = ledgerBalances(d.ledger);
  const proj = projectedSplit(p.contracted_fee_minor, a);
  const st = PLACEMENT_STATUS[p.status];
  const locked = ["settled", "cancelled", "disputed"].includes(p.status);
  const openDispute = d.disputes.find((x) => x.status === "open");
  const payable = ["commission_payable", "payment_partially_verified"].includes(p.status);
  // What the job owner can settle through the platform: the verified, still-unpaid partner and platform shares.
  const dueThroughPlatform = Math.max(0, b.sourcingOutstanding) + Math.max(0, b.platformOutstanding);
  const canPayThroughPlatform = side === "target" && payable && dueThroughPlatform > 0 && integrations.payments;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={side === "source" ? t("detail.sourcedFor", { org: p.target_org?.name ?? "" }) : t("detail.sourcedBy", { org: p.source_org?.name ?? "" })}
        title={p.referral?.job_title_snapshot}
        description={p.guarantee_until
          ? t("detail.subtitleGuarantee", { candidate: p.referral?.candidate_label ?? "", start: f.date(p.start_date), guarantee: f.date(p.guarantee_until) })
          : t("detail.subtitle", { candidate: p.referral?.candidate_label ?? "", start: f.date(p.start_date) })}
        actions={<StatusPill tone={st.tone} label={tg(`labels.placementStatus.${p.status}`)} />}
      />
      <p className="-mt-2 text-sm text-muted-foreground">{tg(`labels.placementStatusDescription.${p.status}`)}</p>
      {sp.created ? <Flash message={t("detail.flashCreated")} /> : null}
      {sp.payment === "success" && p.status !== "settled" ? <Flash message={t("detail.paymentReturned")} /> : null}
      {sp.payment === "cancelled" ? <p role="status" className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">{t("detail.paymentCancelled")}</p> : null}

      {openDispute ? (
        <div role="status" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{t("detail.disputeOpen", { date: f.date(openDispute.created_at), reason: openDispute.reason })}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {([
          ["sourcing", a.sourcing_bps, proj.sourcing, b.sourcingAllocated, b.sourcingOutstanding, side === "source"],
          ["job_owner", a.job_owner_bps, proj.jobOwner, b.jobOwnerAllocated, null, side === "target"],
          ["platform", a.platform_bps, proj.platform, b.platformAllocated, b.platformOutstanding, false],
        ] as const).map(([label, bps, projected, allocated, outstanding, you]) => (
          <Panel key={label} className={you ? "ring-2 ring-foreground" : ""}>
            <p className="text-sm text-muted-foreground">{t(you ? "detail.shareYou" : "detail.share", { party: t(`party.${label}`), percent: pct(bps) })}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{f.money(b.received ? allocated : projected, cur)}</p>
            <p className="text-xs text-muted-foreground">{b.received ? t("detail.allocated") : t("detail.projected")}</p>
            {outstanding !== null && b.received ? <p className="mt-2 text-sm">{t("detail.outstanding")} <span className="font-medium tabular-nums">{f.money(outstanding, cur)}</span></p> : null}
          </Panel>
        ))}
      </div>

      {canPayThroughPlatform ? (
        <Panel className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <PayCommissionButton orgSlug={orgSlug} placementId={p.id} label={t("detail.payThrough", { amount: f.money(dueThroughPlatform, cur) })} />
          <p className="text-sm text-muted-foreground">{t("detail.payThroughHint")}</p>
        </Panel>
      ) : null}

      <Panel className="flex flex-wrap items-center gap-2">
        {side === "target" && !locked ? (
          <>
            <InvoiceDialog orgSlug={orgSlug} placementId={p.id} currency={cur} defaultAmount={minorToMajorString(p.contracted_fee_minor, cur)} />
            {d.invoices.length ? <EvidenceDialog orgSlug={orgSlug} placementId={p.id} currency={cur} kinds={["client_payment", "client_refund"]} label={t("detail.recordClientPayment")} /> : null}
            {payable ? (
              <EvidenceDialog orgSlug={orgSlug} placementId={p.id} currency={cur} kinds={["sourcing_payout", "platform_remittance"]} label={t("detail.recordPayout")} />
            ) : null}
          </>
        ) : null}
        {!locked ? <DisputeButton orgSlug={orgSlug} placementId={p.id} /> : null}
        <Button variant="ghost" asChild><Link href={`/workspace/${orgSlug}/referrals/${p.referral?.id}`}>{t("detail.openReferral")}</Link></Button>
        <p className="ml-auto text-xs text-muted-foreground">{t("detail.agreement", { rule: a.rule_name, version: String(a.rule_version), terms: a.terms_version })}</p>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <SectionTitle>{t("detail.invoicesTitle")}</SectionTitle>
          {d.invoices.length === 0 && d.evidence.length === 0 ? <p className="text-sm text-muted-foreground">{t("detail.nothingRecorded")}</p> : null}
          <ul className="grid gap-3">
            {d.invoices.map((i) => (
              <li key={i.id} className="rounded-2xl border border-border p-4 text-sm">
                <p className="font-medium">{t("detail.invoice", { number: i.invoice_number })}</p>
                <p className="text-muted-foreground">{i.due_on
                    ? t("detail.invoiceLineDue", { amount: f.money(i.amount_minor, i.currency), tax: f.money(i.tax_minor, i.currency), issued: f.date(i.issued_on), due: f.date(i.due_on) })
                    : t("detail.invoiceLine", { amount: f.money(i.amount_minor, i.currency), tax: f.money(i.tax_minor, i.currency), issued: f.date(i.issued_on) })}</p>
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
                      ? t("detail.evidenceLineFees", { amount: f.money(e.amount_minor, e.currency), fees: f.money(e.processing_fee_minor, e.currency), date: f.date(e.occurred_on), reference: e.reference })
                      : t("detail.evidenceLine", { amount: f.money(e.amount_minor, e.currency), date: f.date(e.occurred_on), reference: e.reference })}
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
                      <td className={`py-2 text-right tabular-nums ${l.amount_minor < 0 ? "text-muted-foreground" : ""}`}>{f.money(l.amount_minor, l.currency)}</td>
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
