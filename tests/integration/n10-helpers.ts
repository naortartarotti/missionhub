import { randomUUID } from "node:crypto";
import { admin, anon, createCandidate, createJob, sharingConsent, sql, termsOf, type TestUser } from "./helpers";

/** Shared fixtures for the N10 suites (network-rules-*.test.ts). */

export const err = (r: { error: { message: string } | null }) => r.error?.message ?? "ok";

/** A referral from `src` (org srcOrg) to a fresh job of `tgt` (org tgtOrg), recorded-authorization path. */
export async function referralBetween(src: TestUser, srcOrg: string, tgt: TestUser, tgtOrg: string, opts: { jobId?: string; candidateId?: string } = {}) {
  const jobId = opts.jobId ?? (await createJob(tgt, tgtOrg, { title: `N10 role ${randomUUID().slice(0, 6)}` }));
  const candidateId = opts.candidateId ?? (await createCandidate(src, srcOrg));
  const consent = await sharingConsent(src, srcOrg, candidateId, jobId);
  const { data, error } = await src.client
    .rpc("submit_referral", {
      p_candidate: candidateId, p_job: jobId, p_terms_version: await termsOf(jobId), p_fields: ["headline", "skills"],
      p_document_ids: [], p_consent: consent, p_idempotency_key: randomUUID(), p_acknowledge_pending: false,
    })
    .single();
  if (error) throw new Error(error.message);
  const out = data as { outcome: string; referral_id: string | null };
  if (out.outcome !== "created" || !out.referral_id) throw new Error(`referral not created: ${out.outcome}`);
  return { referralId: out.referral_id, jobId, candidateId };
}

/** Raw submit attempt (returns the error message or "ok"). */
export async function trySubmit(src: TestUser, srcOrg: string, jobId: string, candidateId?: string) {
  const cand = candidateId ?? (await createCandidate(src, srcOrg));
  const consent = await sharingConsent(src, srcOrg, cand, jobId);
  const r = await src.client.rpc("submit_referral", {
    p_candidate: cand, p_job: jobId, p_terms_version: await termsOf(jobId), p_fields: ["headline", "skills"],
    p_document_ids: [], p_consent: consent, p_idempotency_key: randomUUID(), p_acknowledge_pending: false,
  });
  if (r.error) return r.error.message;
  const out = (Array.isArray(r.data) ? r.data[0] : r.data) as { outcome?: string } | null;
  // submit_referral returns stable error codes as the outcome (app.safe_error_code), not as an error.
  return out?.outcome === "created" ? "ok" : String(out?.outcome);
}

export const version = async (referralId: string) =>
  (await admin().from("referrals").select("version").eq("id", referralId).single()).data!.version;

export async function transition(u: TestUser, referralId: string, to: string, actingOrg?: string) {
  return u.client.rpc("transition_referral", {
    p_referral: referralId, p_to: to as never, p_reason: "", p_expected_version: await version(referralId), p_acting_org: actingOrg,
  });
}

/** Adds an existing user to an org (service role), as the other suites do. */
export async function addMember(orgId: string, u: TestUser, role: "org_admin" | "recruiter_manager" | "recruiter") {
  const { error } = await admin().from("organization_memberships").insert({ organization_id: orgId, user_id: u.id, role, status: "active" });
  if (error) throw error;
}

/** Opens an admin-initiated case against `orgId` and sets its admin category (ready for a first response). */
export async function adminCase(platform: TestUser, orgId: string, category = "shared_outside", referralId?: string) {
  const { data, error } = await platform.client.rpc("admin_open_conduct_case", {
    p_org: orgId, p_category: category, p_admin_source: "other", p_referral: referralId ?? (null as unknown as string),
    p_description: "Admin-initiated case for the N10 integration suite.", p_file_ids: [],
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export function currentVersion(): { id: string; rules: string[] } {
  const [id, rules] = sql(`select id::text || '|' || array_to_string(rule_numbers, ',') from public.network_rules_versions
                            where id = app.rules_current_version()`)[0].split("|");
  return { id, rules: rules.split(",") };
}

export const today = () => sql(`select app.today_et()::text`)[0];

/** A standard notice on a case (category must be set). Returns the notice id. */
export async function sendNotice(platform: TestUser, caseId: string, rules = ["2.3", "3.4"]) {
  const v = currentVersion();
  const { data, error } = await platform.client.rpc("admin_send_conduct_notice", {
    p_case: caseId, p_language: "en", p_conduct_date: today(), p_rules_version: v.id, p_rules_cited: rules,
    p_allegation: "Shared the candidate's profile with an outside agency.", p_alleged_when: "Early November 2026",
    p_evidence_summary: "An email forwarded by the client shows the profile attached.", p_name_reporter: false,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Applies an immediate hold (ground 2.3) on a fresh admin case against `orgId`. */
export async function immediateHold(platform: TestUser, orgId: string) {
  const caseId = await adminCase(platform, orgId);
  const v = currentVersion();
  const { data, error } = await platform.client.rpc("admin_apply_immediate_hold", {
    p_case: caseId, p_ground: "2.3", p_language: "en", p_conduct_date: today(), p_rules_version: v.id, p_rules_cited: [],
    p_allegation: "Shared the candidate's profile with an outside agency.", p_alleged_when: "Early November 2026",
    p_evidence_summary: "An email forwarded by the client shows the profile attached.", p_name_reporter: false,
  });
  if (error) throw new Error(error.message);
  return { caseId, ...(data as { notice_id: string; sanction_id: string }) };
}

/** Moves a notice's response deadline into the past (the case can then be decided on the record). */
export function closeWindow(noticeId: string) {
  sql(`update app.conduct_notices set response_due_at = now() - interval '1 minute' where id = '${noticeId}'`);
}

export async function decide(platform: TestUser, caseId: string, noticeId: string, outcome: string, level: string | null, extra: Record<string, unknown> = {}) {
  return platform.client.rpc("admin_decide_conduct_case", {
    p_case: caseId, p_notice: noticeId, p_outcome: outcome,
    p_finding: outcome === "breach" ? "The member shared the candidate's profile outside its organization, contrary to rule 2.3." : (null as unknown as string),
    p_rules_cited: outcome === "breach" ? ["2.3"] : [], p_residual: false, p_level: level as string,
    ...extra,
  } as never);
}

export function liftAll(orgId: string) {
  sql(`update app.org_sanctions set ended_at = now(), end_reason = 'lifted' where organization_id = '${orgId}' and ended_at is null;
       update public.organizations set suspended_at = null, terminated_at = null where id = '${orgId}'`);
}

export { admin, anon };
