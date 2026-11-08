import Link from "next/link";
import { notFound } from "next/navigation";
import { getRequestContext } from "@/server/auth/context";
import { getPlacement } from "@/features/commissions/queries";
import { ledgerBalances, projectedSplit } from "@/features/commissions/domain";
import { DisputeButton, EvidenceDialog, InvoiceDialog, ReviewEvidenceButtons } from "@/features/commissions/components/finance-forms";
import { Panel } from "@/components/shared/card";
import { SectionTitle } from "@/components/shared/page-header";
import { StatusPill } from "@/components/shared/status-pill";
import { Flash } from "@/components/shared/flash";
import { Button } from "@/components/ui/button";
import { EVIDENCE_KIND, PLACEMENT_STATUS, formatDate } from "@/lib/labels";
import { bpsToPercent, formatMoney, minorToMajorString } from "@/lib/money/format";

export const metadata = { title: "Placement" };

const PARTY_LABEL = { client: "Distributable received", sourcing: "Sourcing recruiter", job_owner: "Job owner", platform: "Platform" } as const;

export default async function PlacementPage({ params, searchParams }: PageProps<"/w/[orgSlug]/commissions/[placementId]">) {
  const { orgSlug, placementId } = await params;
  const sp = await searchParams;
  const ctx = await getRequestContext(orgSlug);
  const d = await getPlacement(ctx, placementId);
  if (!d) notFound();
  const { placement: p, side } = d;
  const a = p.agreement!;
  const cur = p.currency;
  const b = ledgerBalances(d.ledger);
  const proj = projectedSplit(p.contracted_fee_minor, a);
  const st = PLACEMENT_STATUS[p.status];
  const locked = ["settled", "cancelled", "disputed"].includes(p.status);
  const openDispute = d.disputes.find((x) => x.status === "open");

  return (
    <div className="grid gap-6">
      {sp.created ? <Flash message="Placement created from the frozen agreement. Next: record the client invoice." /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Placement · {side === "source" ? `you sourced for ${p.target_org?.name}` : `sourced by ${p.source_org?.name}`}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{p.referral?.job_title_snapshot}</h1>
          <p className="text-muted-foreground">{p.referral?.candidate_label} · starts {formatDate(p.start_date)}{p.guarantee_until ? ` · guarantee until ${formatDate(p.guarantee_until)}` : ""}</p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <StatusPill tone={st.tone} label={st.label} />
          <p className="text-xs text-muted-foreground">{st.description}</p>
        </div>
      </div>

      {openDispute ? (
        <div role="status" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">Dispute opened {formatDate(openDispute.created_at)}: “{openDispute.reason}”. Awaiting platform review.</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {([
          ["Sourcing recruiter", a.sourcing_bps, proj.sourcing, b.sourcingAllocated, b.sourcingOutstanding, side === "source"],
          ["Job owner", a.job_owner_bps, proj.jobOwner, b.jobOwnerAllocated, null, side === "target"],
          ["Platform", a.platform_bps, proj.platform, b.platformAllocated, b.platformOutstanding, false],
        ] as const).map(([label, bps, projected, allocated, outstanding, you]) => (
          <Panel key={label} className={you ? "ring-2 ring-foreground" : ""}>
            <p className="text-sm text-muted-foreground">{label}{you ? " (you)" : ""} · {bpsToPercent(bps)}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{formatMoney(b.received ? allocated : projected, cur)}</p>
            <p className="text-xs text-muted-foreground">{b.received ? "Allocated from verified payments" : "Projected — client payment not verified"}</p>
            {outstanding !== null && b.received ? <p className="mt-2 text-sm">Outstanding: <span className="font-medium tabular-nums">{formatMoney(outstanding, cur)}</span></p> : null}
          </Panel>
        ))}
      </div>

      <Panel className="flex flex-wrap items-center gap-2">
        {side === "target" && !locked ? (
          <>
            <InvoiceDialog orgSlug={orgSlug} placementId={p.id} currency={cur} defaultAmount={minorToMajorString(p.contracted_fee_minor, cur)} />
            {d.invoices.length ? <EvidenceDialog orgSlug={orgSlug} placementId={p.id} currency={cur} kinds={["client_payment", "client_refund"]} label="Record client payment" /> : null}
            {["commission_payable", "payment_partially_verified"].includes(p.status) ? (
              <EvidenceDialog orgSlug={orgSlug} placementId={p.id} currency={cur} kinds={["sourcing_payout", "platform_remittance"]} label="Record payout / remittance" />
            ) : null}
          </>
        ) : null}
        {!locked ? <DisputeButton orgSlug={orgSlug} placementId={p.id} /> : null}
        <Button variant="ghost" asChild><Link href={`/w/${orgSlug}/referrals/${p.referral?.id}`}>Open referral</Link></Button>
        <p className="ml-auto text-xs text-muted-foreground">Agreement: {a.rule_name} v{a.rule_version} · {a.terms_version}</p>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <SectionTitle>Invoices & evidence</SectionTitle>
          {d.invoices.length === 0 && d.evidence.length === 0 ? <p className="text-sm text-muted-foreground">Nothing recorded yet.</p> : null}
          <ul className="grid gap-3">
            {d.invoices.map((i) => (
              <li key={i.id} className="rounded-2xl border border-border p-4 text-sm">
                <p className="font-medium">Invoice {i.invoice_number}</p>
                <p className="text-muted-foreground">{formatMoney(i.amount_minor, i.currency)} + {formatMoney(i.tax_minor, i.currency)} tax · issued {formatDate(i.issued_on)}{i.due_on ? ` · due ${formatDate(i.due_on)}` : ""}</p>
              </li>
            ))}
            {d.evidence.map((e) => {
              const canReview = e.status === "pending" && e.kind === "sourcing_payout" && side === "source" && e.recorded_by !== ctx.userId;
              return (
                <li key={e.id} className="rounded-2xl border border-border p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{EVIDENCE_KIND[e.kind]}</p>
                    <StatusPill tone={e.status === "verified" ? "success" : e.status === "rejected" ? "danger" : "warning"} label={e.status === "pending" ? "Awaiting verification" : e.status === "verified" ? "Verified" : "Rejected"} />
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {formatMoney(e.amount_minor, e.currency)}{e.processing_fee_minor ? ` (fees ${formatMoney(e.processing_fee_minor, e.currency)})` : ""} · {formatDate(e.occurred_on)} · ref {e.reference}
                  </p>
                  {e.review_note ? <p className="mt-1 text-muted-foreground">Review: {e.review_note}</p> : null}
                  {e.status === "pending" && !canReview ? (
                    <p className="mt-2 text-xs text-muted-foreground">{e.kind === "sourcing_payout" ? "The sourcing recruiter confirms receipt." : "Verified by a MissionHub platform administrator."}</p>
                  ) : null}
                  {canReview ? <div className="mt-3"><ReviewEvidenceButtons evidenceId={e.id} orgSlug={orgSlug} placementId={p.id} /></div> : null}
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel>
          <SectionTitle>Ledger</SectionTitle>
          {d.ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">Empty until a client payment is verified. Entries are immutable; corrections are recorded as reversing entries.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Commission ledger</caption>
                <thead><tr className="border-b border-border text-left text-muted-foreground"><th scope="col" className="py-2 font-medium">Entry</th><th scope="col" className="py-2 font-medium">Party</th><th scope="col" className="py-2 text-right font-medium">Amount</th></tr></thead>
                <tbody>
                  {d.ledger.map((l) => (
                    <tr key={l.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2"><span className="capitalize">{l.entry_type.replace(/_/g, " ")}</span><span className="block text-xs text-muted-foreground">{formatDate(l.created_at)}{l.memo ? ` · ${l.memo}` : ""}</span></td>
                      <td className="py-2">{PARTY_LABEL[l.party]}</td>
                      <td className={`py-2 text-right tabular-nums ${l.amount_minor < 0 ? "text-muted-foreground" : ""}`}>{formatMoney(l.amount_minor, l.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h3 className="mt-6 mb-2 text-sm font-semibold">Status history</h3>
          <ol className="grid gap-1.5 text-sm">
            {d.events.map((e) => <li key={e.id} className="flex justify-between gap-3"><span>{PLACEMENT_STATUS[e.to_status].label}{e.reason ? <span className="text-muted-foreground"> · {e.reason}</span> : null}</span><span className="text-muted-foreground">{formatDate(e.created_at)}</span></li>)}
          </ol>
        </Panel>
      </div>
    </div>
  );
}
