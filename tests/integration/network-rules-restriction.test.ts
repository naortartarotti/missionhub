import { beforeAll, describe, expect, it } from "vitest";
import { admin, anon, createCandidate, createJob, createOrg, createUser, drainQueue, sql, type TestUser } from "./helpers";
import { err, immediateHold, referralBetween, transition, trySubmit } from "./n10-helpers";

/**
 * N10 partner-activity restriction (BR-12 to BR-14, BR-42, EC-2, AC-37 to AC-51, AC-137, AC-138,
 * scenarios 8 to 14). The hold is applied through the real admin path (immediate hold, ground 2.3).
 */

let platform: TestUser;
let held: TestUser; // owner of the held org
let partner: TestUser; // sourcing partner
let other: TestUser; // unrelated org
let heldOrg: { id: string };
let pOrg: { id: string };
let oOrg: { id: string };
let heldJob: string;
let partnerCandidate: string;
let matchId: string;
let inflight: string;
let awaiting: string;

beforeAll(async () => {
  platform = await createUser("restr-platform", { platformAdmin: true });
  held = await createUser("restr-held");
  partner = await createUser("restr-partner");
  other = await createUser("restr-other");
  heldOrg = await createOrg(held, "Restr Held");
  pOrg = await createOrg(partner, "Restr Partner");
  oOrg = await createOrg(other, "Restr Other");
  heldJob = await createJob(held, heldOrg.id, { title: "Restricted platform engineer" });
  partnerCandidate = await createCandidate(partner, pOrg.id);
  await drainQueue();
  const m = await admin().from("matches").select("id").eq("candidate_id", partnerCandidate).eq("job_id", heldJob).maybeSingle();
  matchId = m.data!.id;
  // Two referrals submitted before the hold: one delivered, one awaiting the candidate (BR-13).
  inflight = (await referralBetween(partner, pOrg.id, held, heldOrg.id)).referralId;
  const job2 = await createJob(held, heldOrg.id);
  const c2 = await createCandidate(partner, pOrg.id);
  const { data } = await partner.client.rpc("submit_referral_for_candidate", {
    p_candidate: c2, p_job: job2, p_terms_version: sql(`select id::text from public.job_terms_versions where job_id = '${job2}'`)[0],
    p_fields: ["headline", "skills"], p_document_ids: [], p_idempotency_key: crypto.randomUUID(),
  }).single();
  awaiting = (data as { referral_id: string }).referral_id;
  await immediateHold(platform, heldOrg.id);
});

const opportunity = async (u: TestUser, org: string, match: string) =>
  ((await u.client.rpc("get_opportunities", { p_org: org, p_match: match })).data ?? []) as { match_id: string }[];

describe("held org (network_hold)", () => {
  it("is restricted, and its jobs vanish from partners' opportunities with their settings unchanged (AC-37)", async () => {
    expect(((await held.client.rpc("get_my_org_state", { p_org: heldOrg.id })).data as { restriction: string }).restriction).toBe("network_hold");
    expect(await opportunity(partner, pOrg.id, matchId)).toEqual([]);
    expect(sql(`select accepts_external_referrals::text || '|' || status from public.jobs where id = '${heldJob}'`)).toEqual(["true|active"]);
    // Matches are hidden, never expired (EC-2).
    expect(sql(`select (expired_at is null)::text from public.matches where id = '${matchId}'`)).toEqual(["true"]);
  });

  it("the owner sees network_hold first; another org never reads the reason (AC-38, AC-138, BR-42)", async () => {
    // A job-level reason too (currency mismatch): the restriction still comes first.
    const [cur] = sql(`select salary_currency from public.jobs where id = '${heldJob}'`);
    sql(`update public.jobs set salary_currency = case when salary_currency = 'USD' then 'EUR' else 'USD' end where id = '${heldJob}'`);
    try {
      const { data } = await held.client.rpc("get_jobs_terms_state", { p_org: heldOrg.id, p_job: heldJob });
      expect((data as { hidden_reason: string }[])[0].hidden_reason).toBe("network_hold");
    } finally {
      sql(`update public.jobs set salary_currency = '${cur}' where id = '${heldJob}'`);
    }
    expect(err(await partner.client.rpc("get_jobs_terms_state", { p_org: heldOrg.id, p_job: heldJob }))).toBe("forbidden");
    // No restriction or sanction data is reachable through any exposed table.
    expect((await partner.client.from("jobs").select("id").eq("id", heldJob)).data).toEqual([]);
  });

  it("can't submit (any path); partners can't submit to it (AC-40, AC-41)", async () => {
    const pJob = await createJob(partner, pOrg.id);
    expect(await trySubmit(held, heldOrg.id, pJob)).toBe("partner_activity_restricted");
    const cand = await createCandidate(held, heldOrg.id);
    const r = await held.client.rpc("submit_referral_for_candidate", {
      p_candidate: cand, p_job: pJob, p_terms_version: sql(`select id::text from public.job_terms_versions where job_id = '${pJob}'`)[0],
      p_fields: ["headline"], p_document_ids: [], p_idempotency_key: crypto.randomUUID(),
    }).single();
    expect((r.data as { outcome: string }).outcome).toBe("partner_activity_restricted");
    const fresh = await createJob(held, heldOrg.id);
    expect(await trySubmit(partner, pOrg.id, fresh)).toBe("job_not_open_for_referrals");
  });

  it("can still save 'open to partners' (BR-12.2); internal work continues", async () => {
    const closed = await createJob(held, heldOrg.id, { accepts_external_referrals: false });
    const r = await held.client.rpc("save_job_terms", {
      p_job: closed, p_open: true, p_fee_basis: "pct_base", p_rate_bps: 2000, p_search_type: "contingent_shared", p_attested: true,
      p_guarantee_days: 90, p_guarantee_remedy: "replacement_then_prorata", p_payment_terms_days: 30, p_ownership_months: 6,
    });
    expect(err(r)).toBe("ok");
    expect(err(await held.client.from("candidates").update({ headline: "Internal edit during a hold" }).eq("id", await createCandidate(held, heldOrg.id)))).toBe("ok");
  });

  it("in-flight referrals continue on both sides, including delivery of an awaiting one (AC-44, AC-45)", async () => {
    expect(err(await transition(held, inflight, "accepted", heldOrg.id))).toBe("ok");
    expect(err(await partner.client.rpc("confirm_agreement", { p_referral: inflight }))).toBe("ok");
    expect(err(await transition(held, inflight, "interviewing", heldOrg.id))).toBe("ok");
    expect((await partner.client.from("referral_messages").insert({ referral_id: inflight, author_id: partner.id, author_side: "source", body: "Interview went well." })).error).toBeNull();
    // The candidate confirms during the hold: delivered (job_partner_open, not the restriction).
    const token = (await admin().rpc("issue_candidate_request_token", { p_referral: awaiting, p_actor: partner.id })).data as string;
    const resp = await anon().rpc("respond_candidate_request", { p_token: token, p_accept: true, p_profile: { full_name: "Confirmed Candidate" }, p_meta: {} });
    expect(err(resp)).toBe("ok");
    expect(sql(`select status from public.referrals where id = '${awaiting}'`)).toEqual(["submitted"]);
  });

  it("S21 availability: neutral for related orgs, not_found for others, never a reason (AC-48, AC-49, AC-137)", async () => {
    const viaMatch = (await partner.client.rpc("get_partner_job_availability", { p_org: pOrg.id, p_match: matchId })).data as Record<string, string>;
    expect(viaMatch).toEqual({ status: "not_taking_referrals", org_name: "Restr Held", job_title: "Restricted platform engineer" });
    const job = sql(`select job_id::text from public.referrals where id = '${inflight}'`)[0];
    expect(((await partner.client.rpc("get_partner_job_availability", { p_org: pOrg.id, p_job: job })).data as { status: string }).status).toBe("not_taking_referrals");
    // An unrelated org (no referral, no live match) gets the generic not_found, even with the job id.
    expect((await other.client.rpc("get_partner_job_availability", { p_org: oOrg.id, p_job: heldJob })).data).toEqual({ status: "not_found" });
    // Forged org: not_found.
    expect((await other.client.rpc("get_partner_job_availability", { p_org: pOrg.id, p_match: matchId })).data).toEqual({ status: "not_found" });
  });

  it("the held org gets no opportunities and can't triage or mark matches (BR-12.5)", async () => {
    const heldCand = await createCandidate(held, heldOrg.id);
    const pJob = await createJob(partner, pOrg.id);
    await drainQueue();
    const m = await admin().from("matches").select("id").eq("candidate_id", heldCand).eq("job_id", pJob).maybeSingle();
    if (m.data) {
      expect(await opportunity(held, heldOrg.id, m.data.id)).toEqual([]);
      expect(err(await held.client.rpc("set_match_triage", { p_org: heldOrg.id, p_match: m.data.id, p_state: "saved", p_reason: "" }))).toBe("not_found");
    }
    const { data } = await partner.client.rpc("get_job_match_summary", { p_job: pJob });
    expect((data as { strong_count: number }[])[0]).toBeDefined();
  });

  it("no notification or audit row of the partner reveals the hold (AC-50)", () => {
    expect(sql(`select count(*) from public.notifications n join public.organization_memberships m on m.user_id = n.user_id
                where m.organization_id = '${pOrg.id}' and (n.kind like 'sanction.%' or n.kind like 'conduct.%')`)).toEqual(["0"]);
    expect(sql(`select count(*) from public.audit_events where organization_id = '${pOrg.id}' and (action like 'sanction.%' or action like 'conduct.%')`)).toEqual(["0"]);
  });
});

describe("lift (AC-43, AC-51, scenario 14)", () => {
  it("lifting the hold restores partner visibility, the same match row and its triage state", async () => {
    sql(`insert into public.match_triage (match_id, organization_id, state, updated_by) values ('${matchId}', '${pOrg.id}', 'saved', '${partner.id}')
         on conflict (organization_id, match_id) do update set state = 'saved'`);
    const hold = sql(`select id::text from app.org_sanctions where organization_id = '${heldOrg.id}' and ended_at is null`)[0];
    expect(err(await platform.client.rpc("admin_lift_sanction", { p_org: heldOrg.id, p_sanction: hold, p_reason: "" }))).toBe("reason_required");
    expect(err(await platform.client.rpc("admin_lift_sanction", { p_org: heldOrg.id, p_sanction: hold, p_reason: "Hold no longer needed after review." }))).toBe("ok");
    expect(((await held.client.rpc("get_my_org_state", { p_org: heldOrg.id })).data as { restriction: string | null }).restriction).toBeNull();
    const opp = (await partner.client.rpc("get_opportunities", { p_org: pOrg.id, p_match: matchId })).data as { match_id: string; triage_state: string }[];
    expect(opp.map((o) => [o.match_id, o.triage_state])).toEqual([[matchId, "saved"]]);
    // Matching re-queued for the org (rows expired by any earlier suspension refresh within a cycle).
    expect(Number(sql(`select count(*) from public.background_jobs where kind = 'match.job' and dedup_key = '${heldJob}'`)[0])).toBeGreaterThan(0);
    // The org's admins are told, with no reason and no admin name.
    expect(sql(`select title || '|' || body from public.notifications where user_id = '${held.id}' and kind = 'sanction.lifted'`))
      .toEqual(["A sanction on your organization was lifted|See the details on your Network standing page."]);
  });
});

describe("sanction columns (QA-N10-01, BR-42)", () => {
  it("members can't select suspended_at / terminated_at / suspended_reason, even of their own org; platform admins read them through admin_organizations", async () => {
    sql(`update public.organizations set suspended_reason = 'internal' where id = '${heldOrg.id}'`);
    try {
      for (const col of ["suspended_at", "terminated_at", "suspended_reason"]) {
        expect((await held.client.from("organizations").select(col).eq("id", heldOrg.id)).error).not.toBeNull();
        expect((await partner.client.from("organizations").select(col).eq("id", heldOrg.id)).error).not.toBeNull();
      }
      // Other columns still work for members and partners.
      expect((await held.client.from("organizations").select("id, name, locale").eq("id", heldOrg.id)).data).toHaveLength(1);
      expect((await held.client.from("admin_organizations").select("id").eq("id", heldOrg.id)).data).toEqual([]);
      const viaAdmin = await platform.client.from("admin_organizations").select("suspended_reason, organization_memberships(count)").eq("id", heldOrg.id).single();
      expect(viaAdmin.data?.suspended_reason).toBe("internal");
      expect((await anon().from("admin_organizations").select("id")).error).not.toBeNull();
    } finally {
      sql(`update public.organizations set suspended_reason = null where id = '${heldOrg.id}'`);
    }
  });
});
