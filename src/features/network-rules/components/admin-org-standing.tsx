import Link from "next/link";
import { Panel } from "@/components/shared/card";
import { SectionTitle } from "@/components/shared/page-header";
import { StatusPill, type Tone } from "@/components/shared/status-pill";
import { getFormatter, getGlobalT, getT } from "@/i18n/server";
import type { SanctionLevel } from "../domain";
import { SANCTION_STATUS_TONE, sanctionStatusKey } from "../ui-state";
import type { SanctionStatus } from "../types";
import { conductStateKey } from "./admin-conduct-card";
import { CloseStaleButton, LiftSanctionButton } from "./admin-org-controls";

/** admin_org_conduct_file (backend.md §3.5). */
export type OrgConductFile = {
  standing: { level: SanctionLevel | null; since?: string | null; legacy?: boolean; sanction_id?: string } | null;
  restriction: string | null;
  settlement_state: "settlement" | "closed" | null;
  suspended_at: string | null;
  terminated_at: string | null;
  legacy_suspended: boolean;
  active: { hold_id: string | null; suspension_id: string | null; termination_id: string | null };
  can_lift_termination: boolean;
  sanctions: { id: string; case_id: string | null; level: SanctionLevel; applied_at: string; applied_by_name: string | null; decided_by_name: string | null; status: SanctionStatus; expires_at: string | null; ended_at: string | null }[];
  open_cases: { id: string; state: string; next_deadline: string | null; first_response_due_at: string | null }[];
  acceptances: { label: string; accepted_at: string; accepted_by_name: string | null }[];
  members_not_accepted: { user_id: string; name: string; accepted_current: boolean; accepted_upcoming: boolean }[] | null;
  obligations: {
    referrals: { id: string; status: string; job_title: string; partner_org_name: string; last_activity_at: string; inactive_days: number; stale_closable: boolean }[];
    placements: { id: string; referral_id: string; status: string; guarantee_until: string | null; reasons: ("guarantee" | "payout_not_confirmed" | "open_dispute")[] }[];
    all_settled: boolean;
  } | null;
};

/** S19 header pills: standing (incl. legacy) plus an info pill for rules not accepted. */
export async function OrgStandingPills({ file }: { file: OrgConductFile }) {
  const t = await getT("admin");
  const pill = ((): { tone: Tone; label: string } => {
    if (file.terminated_at) return { tone: "danger", label: file.settlement_state === "settlement" ? t("orgDetail.standingPill.terminatedSettling") : t("orgDetail.standingPill.terminated") };
    if (file.legacy_suspended) return { tone: "danger", label: t("orgDetail.legacySuspended") };
    if (file.active.suspension_id || file.suspended_at) return { tone: "danger", label: t("orgDetail.standingPill.suspended") };
    if (file.active.hold_id) return { tone: "warning", label: t("orgDetail.standingPill.hold") };
    if (file.standing?.level === "warning") return { tone: "warning", label: t("orgDetail.standingPill.warning") };
    return { tone: "success", label: t("orgDetail.standingPill.active") };
  })();
  return (
    <>
      <StatusPill tone={pill.tone} label={pill.label} />
      {file.restriction === "rules_not_accepted" ? <StatusPill tone="info" label={t("orgDetail.rulesNotAccepted")} /> : null}
    </>
  );
}

/** S19 header actions: Open conduct case, Lift…, Lift termination… (or the decider's muted line). */
export async function OrgSanctionActions({ orgId, orgName, file }: { orgId: string; orgName: string; file: OrgConductFile }) {
  const t = await getT("admin");
  const liftable = file.active.hold_id ? { kind: "hold" as const, id: file.active.hold_id } : file.active.suspension_id ? { kind: "suspension" as const, id: file.active.suspension_id } : file.legacy_suspended ? { kind: "suspension" as const, id: null } : null;
  return (
    <>
      <Link href={`/admin/disputes/conduct/new?org=${orgId}`} className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-sm font-medium hover:bg-accent sm:min-h-8">
        {t("conduct.newCase")}
      </Link>
      {liftable ? <LiftSanctionButton orgId={orgId} orgName={orgName} kind={liftable.kind} sanctionId={liftable.id} /> : null}
      {file.active.termination_id ? (
        file.can_lift_termination ? (
          <LiftSanctionButton orgId={orgId} orgName={orgName} kind="termination" sanctionId={file.active.termination_id} />
        ) : (
          <p className="text-xs text-muted-foreground">{t("orgDetail.liftTerminationSelf")}</p>
        )
      ) : null}
    </>
  );
}

/** The standing line under the title (replaces `orgDetail.suspendedSince`). */
export async function OrgStandingLine({ file }: { file: OrgConductFile }) {
  const [t, tg, f] = await Promise.all([getT("admin"), getGlobalT(), getFormatter()]);
  const active = file.sanctions.find((s) => s.status === "active" && s.level !== "warning") ?? file.sanctions.find((s) => s.status === "active");
  if (!active) return null;
  return (
    <span>
      {t("orgDetail.standingSince", { level: tg(`labels.sanctionLevel.${active.level}`), date: f.etDate(active.applied_at) })}
      {active.case_id ? (
        <>
          {" · "}
          <Link href={`/admin/disputes/conduct/${active.case_id}`} className="underline underline-offset-4">{t("orgDetail.caseLink")}</Link>
        </>
      ) : null}
    </span>
  );
}

/** S19 panels: Network standing (sanctions, open cases, acceptance) and Remaining obligations (S27). */
export async function OrgStandingPanels({ file }: { file: OrgConductFile }) {
  const [t, tg, f] = await Promise.all([getT("admin"), getGlobalT(), getFormatter()]);
  const notAccepted = (file.members_not_accepted ?? []).filter((m) => !m.accepted_current);
  const latest = file.acceptances[0];
  return (
    <>
      <Panel className="grid gap-5">
        <SectionTitle>{t("orgDetail.standing")}</SectionTitle>
        <section className="grid gap-2">
          <h3 className="text-sm font-semibold">{t("orgDetail.sanctions")}</h3>
          {file.sanctions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("orgDetail.noSanctions")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">{t("orgDetail.col.level")}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t("orgDetail.col.decided")}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t("orgDetail.col.by")}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t("orgDetail.col.case")}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t("orgDetail.col.status")}</th>
                    <th scope="col" className="py-2 font-medium">{t("orgDetail.col.expires")}</th>
                  </tr>
                </thead>
                <tbody>
                  {file.sanctions.map((s) => (
                    <tr key={s.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 font-medium">{tg(`labels.sanctionLevel.${s.level}`)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{f.etDate(s.applied_at)}</td>
                      <td className="py-2 pr-3">{s.decided_by_name ?? s.applied_by_name ?? "—"}</td>
                      <td className="py-2 pr-3">{s.case_id ? <Link href={`/admin/disputes/conduct/${s.case_id}`} className="underline underline-offset-4">{t("orgDetail.caseLink")}</Link> : "—"}</td>
                      <td className="py-2 pr-3"><StatusPill tone={SANCTION_STATUS_TONE[s.status]} label={tg(`labels.sanctionStatus.${sanctionStatusKey(s.status)}`, { date: f.etDate(s.status === "expired" ? s.expires_at : s.ended_at) })} className="text-xs" /></td>
                      <td className="py-2 whitespace-nowrap">{s.expires_at ? f.etDate(s.expires_at) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="grid gap-2">
          <h3 className="text-sm font-semibold">{t("orgDetail.openCases")}</h3>
          {file.open_cases.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("orgDetail.noOpenCases")}</p>
          ) : (
            <ul className="grid gap-1.5 text-sm">
              {file.open_cases.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/disputes/conduct/${c.id}`} className="font-medium underline underline-offset-4">{t(`conduct.state.${conductStateKey(c.state)}`)}</Link>
                  {c.next_deadline || c.first_response_due_at ? <span className="text-muted-foreground">{t("orgDetail.nextDeadline", { when: f.etDateTime(c.next_deadline ?? c.first_response_due_at) })}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="grid gap-2 text-sm">
          <h3 className="font-semibold">{t("orgDetail.rulesAcceptance")}</h3>
          {latest ? <p>{t("orgDetail.orgAccepted", { label: latest.label, date: f.etDate(latest.accepted_at) })}</p> : null}
          {file.restriction === "rules_not_accepted" ? <p className="text-muted-foreground">{t("orgDetail.orgNotAccepted", { label: latest?.label ?? "—" })}</p> : null}
          {notAccepted.length ? (
            <details className="rounded-2xl border border-border/60 px-3 py-2">
              <summary className="min-h-9 cursor-pointer">{t("orgDetail.membersNotAccepted", { count: notAccepted.length, label: latest?.label ?? "—" })} · {t("orgDetail.showNames")}</summary>
              <ul className="mt-2 list-disc pl-5 text-muted-foreground">{notAccepted.map((m) => <li key={m.user_id}>{m.name}</li>)}</ul>
            </details>
          ) : null}
        </section>
      </Panel>

      {file.obligations ? (
        <Panel className="grid gap-4">
          <SectionTitle>{t("orgDetail.obligations")}</SectionTitle>
          {file.terminated_at ? <p className="text-sm text-muted-foreground">{t("orgDetail.obligationsHint")}</p> : null}
          {file.obligations.referrals.length === 0 && file.obligations.placements.length === 0 ? (
            <p className="text-sm text-muted-foreground">{file.obligations.all_settled && file.terminated_at ? t("orgDetail.allSettled") : t("orgDetail.noObligations")}</p>
          ) : null}
          {file.obligations.referrals.length ? (
            <section className="grid gap-2">
              <h3 className="text-sm font-semibold">{t("orgDetail.referralsInProgress")}</h3>
              <ul className="grid gap-2 text-sm">
                {file.obligations.referrals.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/60 p-3">
                    <span className="grid gap-0.5">
                      <Link href={`/admin/referrals/${r.id}`} className="font-medium underline underline-offset-4">{r.job_title}</Link>
                      <span className="text-muted-foreground">{t("orgDetail.partner")}: {r.partner_org_name} · {tg(`labels.referralStatus.${r.status}` as Parameters<typeof tg>[0])}</span>
                      {file.terminated_at && r.inactive_days >= 60 ? <span className="text-xs font-medium">{t("orgDetail.stale", { count: r.inactive_days })}</span> : null}
                    </span>
                    {r.stale_closable ? <CloseStaleButton referralId={r.id} /> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {file.obligations.placements.length ? (
            <section className="grid gap-2">
              <h3 className="text-sm font-semibold">{t("orgDetail.placementsOpen")}</h3>
              <ul className="grid gap-2 text-sm">
                {file.obligations.placements.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 p-3">
                    <Link href={`/admin/referrals/${p.referral_id}`} className="font-medium underline underline-offset-4">{tg(`labels.placementStatus.${p.status}` as Parameters<typeof tg>[0])}</Link>
                    {p.reasons.map((reason) => (
                      <span key={reason} className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                        {reason === "guarantee" ? t("orgDetail.obligation.guarantee") : reason === "payout_not_confirmed" ? t("orgDetail.obligation.payout") : t("orgDetail.obligation.dispute")}
                      </span>
                    ))}
                    {p.guarantee_until ? <span className="text-xs text-muted-foreground">{f.date(p.guarantee_until)}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </Panel>
      ) : null}
    </>
  );
}
