import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { admin, anon, createJob, createOrg, createUser, currentRulesVersion, sql, type TestUser } from "./helpers";
import { addMember, err, referralBetween, transition, trySubmit } from "./n10-helpers";
import { rulesSha256 } from "@/features/network-rules/hash";

/**
 * N10 rules versions and acceptance: BR-1 to BR-10, AC-1 to AC-36, EC-4, scenarios 1, 2, 4, 5, 6.
 * The suite publishes test versions and removes them afterwards (published versions are immutable in
 * the product, so cleanup disables the guard triggers through local superuser SQL only).
 */

let platform: TestUser;
let member: TestUser;
const created: string[] = [];

const BODY = (extra = "") => `## Introduction\n\nTest rules.${extra}\n\n## 1. Membership\n\n**1.1** Accept the rules.\n\n**2.3** Keep it inside.\n`;
const texts = (extra = "") => ({ en: BODY(extra), "fr-CA": BODY(extra), "pt-BR": BODY(extra) });
const summaries = { en: "Changed the way acceptance works.", "fr-CA": "Changement de l'acceptation des règles.", "pt-BR": "Mudança na forma de aceitar as regras." };
const dateIn = (days: number) => sql(`select (app.today_et() + ${days})::text`)[0];

async function publish(over: Record<string, unknown> = {}) {
  const label = `9.${Math.floor(Math.random() * 900) + 100}`;
  const r = await platform.client.rpc("publish_network_rules_version", {
    p_label: label, p_type: "material", p_effective_on: dateIn(30), p_texts: texts(), p_summaries: summaries,
    p_legal_reason: null as unknown as string, p_approval_reference: "Founder + counsel approval, test", ...over,
  } as never);
  if (!r.error) created.push(r.data as string);
  return r;
}

function purgeVersion(id: string) {
  sql(`alter table public.network_rules_versions disable trigger network_rules_guard_version;
       alter table public.network_rules_version_texts disable trigger network_rules_guard_text;
       delete from public.network_rules_org_acceptances where version_id = '${id}';
       delete from public.network_rules_member_acceptances where version_id = '${id}';
       delete from public.network_rules_versions where id = '${id}';
       alter table public.network_rules_version_texts enable trigger network_rules_guard_text;
       alter table public.network_rules_versions enable trigger network_rules_guard_version;`);
}

/** Moves a published version's effective date to now (simulates reaching 00:00 ET on its date). */
function makeEffective(id: string) {
  sql(`alter table public.network_rules_versions disable trigger network_rules_guard_version;
       update public.network_rules_versions set effective_at = now() - interval '1 second', effective_on = app.today_et() where id = '${id}';
       alter table public.network_rules_versions enable trigger network_rules_guard_version;`);
}

beforeAll(async () => {
  platform = await createUser("n10-platform", { platformAdmin: true });
  member = await createUser("n10-member");
  await createOrg(member, "N10 Member Org");
});

afterAll(() => {
  for (const id of created) purgeVersion(id);
});

describe("publishing (BR-2, BR-3, AC-1 to AC-9)", () => {
  it("refuses a missing locale, a marker, a short material date, a legally-required version without reason", async () => {
    expect(err(await publish({ p_texts: { en: BODY(), "fr-CA": BODY() } }))).toBe("missing_locale");
    const marker = await publish({ p_texts: texts("\n<!-- ⚖️ counsel -->") });
    expect(marker.error?.message).toBe("marker_found");
    const detail = JSON.parse(marker.error!.details!) as { locale: string; line: number; marker: string }[];
    expect(detail.filter((d) => d.locale === "en").map((d) => d.marker).sort()).toEqual(["<!--", "⚖️"]);
    expect(detail[0].line).toBe(4);
    for (const m of ["[TODO: x]", "[placeholder]"]) expect(err(await publish({ p_texts: texts(` ${m}`) }))).toBe("marker_found");
    const early = await publish({ p_effective_on: dateIn(29) });
    expect(early.error?.message).toBe("effective_date");
    expect(early.error?.details).toBe(dateIn(30));
    expect(err(await publish({ p_type: "legally_required", p_effective_on: dateIn(3) }))).toBe("legal_reason_required");
    expect(err(await publish({ p_approval_reference: "" }))).toBe("approval_reference_required");
    expect(err(await publish({ p_type: "initial" }))).toBe("initial_exists");
    expect(err(await publish({ p_summaries: { en: "short" } }))).toBe("missing_locale");
  });

  it("a non-admin can't publish, save or read drafts (AC-9)", async () => {
    const r = await member.client.rpc("publish_network_rules_version", {
      p_label: "9.999", p_type: "material", p_effective_on: dateIn(40), p_texts: texts(), p_summaries: summaries,
      p_legal_reason: null as unknown as string, p_approval_reference: "x".repeat(10),
    });
    expect(err(r)).toBe("forbidden");
    expect(err(await member.client.rpc("admin_list_network_rules"))).toBe("forbidden");
  });

  it("publishes a material version at 00:00 ET on its date, hashes each locale, and allows one upcoming (AC-3, AC-6, AC-8)", async () => {
    const crlf = { en: BODY().replace(/\n/g, "\r\n"), "fr-CA": BODY(" fr"), "pt-BR": BODY(" pt") };
    const ok = await publish({ p_texts: crlf });
    expect(ok.error).toBeNull();
    const id = ok.data as string;
    const [effectiveEt] = sql(`select to_char(effective_at at time zone 'America/Toronto', 'YYYY-MM-DD HH24:MI') from public.network_rules_versions where id = '${id}'`);
    expect(effectiveEt).toBe(`${dateIn(30)} 00:00`);
    // CRLF is normalized before storing and hashing; the hash equals sha256(stored text) and the TS mirror.
    const { data: rows } = await member.client.from("network_rules_version_texts").select("locale, body, sha256").eq("version_id", id);
    for (const r of rows!) {
      expect(r.body.includes("\r")).toBe(false);
      expect(r.sha256).toBe(rulesSha256(r.body));
    }
    expect(rows!.find((r) => r.locale === "en")!.sha256).toBe(rulesSha256(BODY()));
    expect(sql(`select array_to_string(rule_numbers, ',') from public.network_rules_versions where id = '${id}'`)).toEqual(["1.1,2.3"]);
    expect(err(await publish({ p_effective_on: dateIn(45) }))).toBe("upcoming_exists");
    // Notified to members at publication (BR-39), with the accept-by date and no other content.
    const [n] = sql(`select title || '|' || body || '|' || link from public.notifications where user_id = '${member.id}' and kind = 'network_rules.published' order by created_at desc limit 1`);
    expect(n).toMatch(/^Network Rules 9\.\d+ published\|Read what changed and accept it by .+\.\|\/network-rules#upcoming$/);
  });

  it("a published version can't be updated or deleted by anyone, through PostgREST or the service role (AC-8, EC-4)", async () => {
    const id = created[0];
    const u = await member.client.from("network_rules_versions").update({ label: "0.1" }).eq("id", id);
    expect(u.error).not.toBeNull();
    const t = await member.client.from("network_rules_version_texts").update({ body: "x" }).eq("version_id", id);
    expect(t.error).not.toBeNull();
    const a1 = await admin().from("network_rules_versions").update({ label: "0.2" }).eq("id", id);
    expect(a1.error?.message).toMatch(/immutable_record/);
    const a2 = await admin().from("network_rules_version_texts").delete().eq("version_id", id);
    expect(a2.error?.message).toMatch(/immutable_record/);
    const a3 = await admin().from("network_rules_versions").delete().eq("id", id);
    expect(a3.error?.message).toMatch(/immutable_record/);
  });

  it("drafts are invisible to members; published versions are readable by any signed-in user, never by anon (BR-4)", async () => {
    const d = await platform.client.rpc("save_network_rules_draft", {
      p_draft: null as unknown as string, p_label: "8.123", p_type: "material", p_effective_on: dateIn(60),
      p_texts: { en: "draft <!-- with a marker -->" }, p_summaries: {},
    });
    expect(d.error).toBeNull();
    created.push(d.data as string);
    expect((await member.client.from("network_rules_versions").select("id").eq("id", d.data as string)).data).toEqual([]);
    const noOrg = await createUser("n10-no-org");
    expect(((await noOrg.client.from("network_rules_versions").select("id")).data ?? []).length).toBeGreaterThan(0);
    expect((await anon().from("network_rules_versions").select("id")).data ?? []).toEqual([]);
    expect(err(await platform.client.rpc("delete_network_rules_draft", { p_draft: d.data as string }))).toBe("ok");
    expect(err(await platform.client.rpc("delete_network_rules_draft", { p_draft: created[0] }))).toBe("not_found");
  });
});

describe("joining and acceptance (BR-5, BR-6, AC-14 to AC-16, AC-21, AC-22, AC-27, AC-36)", () => {
  it("org creation needs both statements and the current version; records both with the locale's SHA-256", async () => {
    const u = await createUser("n10-joiner", { acceptRules: false });
    const v = await currentRulesVersion();
    const slug = () => `n10-j-${randomUUID().slice(0, 6)}`;
    expect(err(await u.client.rpc("create_organization", { p_name: "No acceptance", p_slug: slug() }))).toBe("rules_acceptance_required");
    expect(err(await u.client.rpc("create_organization", { p_name: "Only member", p_slug: slug(), p_rules_version: v, p_rules_locale: "en", p_accept_member: true }))).toBe("rules_acceptance_required");
    expect(err(await u.client.rpc("create_organization", { p_name: "Unknown", p_slug: slug(), p_rules_version: randomUUID(), p_rules_locale: "en", p_accept_org: true, p_accept_member: true }))).toBe("rules_acceptance_required");
    // The upcoming (not yet current) version is "changed" for onboarding (AC-36).
    expect(err(await u.client.rpc("create_organization", { p_name: "Upcoming", p_slug: slug(), p_rules_version: created[0], p_rules_locale: "en", p_accept_org: true, p_accept_member: true }))).toBe("rules_version_changed");
    expect(sql(`select count(*) from public.organizations where created_by = '${u.id}'`)).toEqual(["0"]);

    const { data: orgId, error } = await u.client.rpc("create_organization", { p_name: "Joined", p_slug: slug(), p_rules_version: v, p_rules_locale: "fr-CA", p_accept_org: true, p_accept_member: true });
    expect(error).toBeNull();
    const [hash] = sql(`select sha256 from public.network_rules_version_texts where version_id = '${v}' and locale = 'fr-CA'`);
    expect(sql(`select locale || '|' || sha256 || '|' || accepted_by from public.network_rules_org_acceptances where organization_id = '${orgId}'`)).toEqual([`fr-CA|${hash}|${u.id}`]);
    expect(sql(`select locale || '|' || sha256 || '|' || organization_id from public.network_rules_member_acceptances where user_id = '${u.id}'`)).toEqual([`fr-CA|${hash}|${orgId}`]);
    expect(sql(`select string_agg(action, ',' order by id) from public.audit_events where organization_id = '${orgId}' and action like 'network_rules.%'`)).toEqual(["network_rules.org_accepted,network_rules.member_accepted"]);
  });

  it("an org_admin whose org hasn't accepted must give both statements; a recruiter gives the personal one; neither record implies the other (N10-D18, AC-27)", async () => {
    const owner = await createUser("n10-owner");
    const org = await createOrg(owner, "N10 Two Statements");
    const v = created[0]; // the upcoming material version: nobody accepted it yet
    const admin2 = await createUser("n10-admin2");
    await addMember(org.id, admin2, "org_admin");
    const rec = await createUser("n10-rec");
    await addMember(org.id, rec, "recruiter");
    const accept = (u: TestUser, personal: boolean, forOrg: boolean) =>
      u.client.rpc("accept_network_rules", { p_org: org.id, p_version: v, p_locale: "en", p_personal: personal, p_for_org: forOrg });
    expect(err(await accept(admin2, true, false))).toBe("rules_acceptance_required");
    expect(err(await accept(rec, false, true))).toBe("forbidden");
    expect(err(await accept(rec, true, false))).toBe("ok");
    expect(sql(`select count(*) from public.network_rules_org_acceptances where organization_id = '${org.id}' and version_id = '${v}'`)).toEqual(["0"]);
    expect(err(await accept(admin2, true, true))).toBe("ok");
    expect(sql(`select count(*) from public.network_rules_org_acceptances where organization_id = '${org.id}' and version_id = '${v}'`)).toEqual(["1"]);
    expect(sql(`select count(*) from public.network_rules_member_acceptances where version_id = '${v}' and user_id = '${owner.id}'`)).toEqual(["0"]);
    // Once the org accepted, the other admin can accept personally only. Idempotent.
    expect(err(await accept(owner, true, false))).toBe("ok");
    expect(err(await accept(owner, true, false))).toBe("ok");
    // Unknown version or another org: refused.
    expect(err(await rec.client.rpc("accept_network_rules", { p_org: org.id, p_version: randomUUID(), p_locale: "en", p_personal: true, p_for_org: false }))).toBe("rules_acceptance_required");
    const outsider = await createUser("n10-outsider");
    expect(err(await outsider.client.rpc("accept_network_rules", { p_org: org.id, p_version: v, p_locale: "en", p_personal: true, p_for_org: false }))).toBe("not_found");
    // Acceptances are append-only, even for the service role.
    expect((await admin().from("network_rules_member_acceptances").update({ locale: "pt-BR" }).eq("user_id", rec.id)).error?.message).toMatch(/immutable_record/);
  });

  it("get_my_org_state exposes the own org's rules state only (EC-7)", async () => {
    const u = await createUser("n10-state");
    const org = await createOrg(u, "N10 State");
    const { data } = await u.client.rpc("get_my_org_state", { p_org: org.id });
    const s = data as { restriction: string | null; settlement_mode: boolean; quebec: boolean; rules: Record<string, unknown> };
    expect(s.restriction).toBeNull();
    expect(s.settlement_mode).toBe(false);
    expect(s.rules.gate_required).toBe(false);
    expect(s.rules.member_accepted_current).toBe(true);
    expect((s.rules.upcoming as { id: string }).id).toBe(created[0]);
    expect(s.rules.member_accepted_upcoming).toBe(false);
    expect(err(await member.client.rpc("get_my_org_state", { p_org: org.id }))).toBe("not_found");
    sql(`update public.organizations set locale = 'fr-CA' where id = '${org.id}'`);
    expect(((await u.client.rpc("get_my_org_state", { p_org: org.id })).data as { quebec: boolean }).quebec).toBe(true);
  });
});

describe("after a material version's effective date (BR-9, AC-28 to AC-30, scenarios 4 and 5)", () => {
  let hirer: TestUser;
  let sourcer: TestUser;
  let hOrg: { id: string };
  let sOrg: { id: string };
  let jobId: string;
  let inflight: string;
  let v2: string;

  beforeAll(async () => {
    hirer = await createUser("n10-hirer");
    sourcer = await createUser("n10-sourcer");
    hOrg = await createOrg(hirer, "N10 Hirer");
    sOrg = await createOrg(sourcer, "N10 Sourcer");
    jobId = await createJob(hirer, hOrg.id);
    inflight = (await referralBetween(sourcer, sOrg.id, hirer, hOrg.id)).referralId;
    v2 = created[0];
    // The sourcing org accepted v2 for the org before the date; the hiring org didn't.
    expect(err(await sourcer.client.rpc("accept_network_rules", { p_org: sOrg.id, p_version: v2, p_locale: "en", p_personal: false, p_for_org: true }))).toBe("ok");
    makeEffective(v2);
  });

  it("an org without org acceptance is restricted (rules_not_accepted): jobs hidden, submits refused, no sanction recorded", async () => {
    const state = (await hirer.client.rpc("get_my_org_state", { p_org: hOrg.id })).data as { restriction: string; rules: { user_restricted: boolean } };
    expect(state.restriction).toBe("rules_not_accepted");
    expect(state.rules.user_restricted).toBe(true);
    // Owner sees the reason first (AC-138); the job's settings are unchanged (AC-37).
    const { data: terms } = await hirer.client.rpc("get_jobs_terms_state", { p_org: hOrg.id, p_job: jobId });
    expect((terms as { hidden_reason: string }[])[0].hidden_reason).toBe("rules_not_accepted");
    expect(sql(`select accepts_external_referrals from public.jobs where id = '${jobId}'`)).toEqual(["t"]);
    // A partner's submission gets the hidden-job outcome (AC-41).
    expect(await trySubmit(sourcer, sOrg.id, jobId)).toBe("job_not_open_for_referrals");
    expect(sql(`select count(*) from app.org_sanctions where organization_id = '${hOrg.id}'`)).toEqual(["0"]);
  });

  it("a member who accepted only the earlier version can't submit or open a job to partners (per user, BR-9 b)", async () => {
    // The sourcing org accepted v2, but its member didn't: user-level restriction only.
    const state = (await sourcer.client.rpc("get_my_org_state", { p_org: sOrg.id })).data as { restriction: string | null; rules: { user_restricted: boolean } };
    expect(state.restriction).toBeNull();
    expect(state.rules.user_restricted).toBe(true);
    const target = await createUser("n10-target");
    const tOrg = await createOrg(target, "N10 Target");
    // The target's creator auto-accepted only v1 too, so accept v2 for that org and personally.
    expect(err(await target.client.rpc("accept_network_rules", { p_org: tOrg.id, p_version: v2, p_locale: "en", p_personal: true, p_for_org: true }))).toBe("ok");
    const openJob = await createJob(target, tOrg.id);
    expect(await trySubmit(sourcer, sOrg.id, openJob)).toBe("rules_acceptance_required");
    // Opening a job (closed -> open) is refused; editing other fields is fine.
    const closed = await createJob(sourcer, sOrg.id, { accepts_external_referrals: false });
    const open = await sourcer.client.rpc("save_job_terms", {
      p_job: closed, p_open: true, p_fee_basis: "pct_base", p_rate_bps: 2000, p_search_type: "contingent_shared", p_attested: true,
      p_guarantee_days: 90, p_guarantee_remedy: "replacement_then_prorata", p_payment_terms_days: 30, p_ownership_months: 6,
    });
    expect(err(open)).toBe("rules_acceptance_required");
    expect(err(await sourcer.client.from("jobs").update({ title: "Renamed while restricted" }).eq("id", closed))).toBe("ok");
    // After accepting, it works.
    expect(err(await sourcer.client.rpc("accept_network_rules", { p_org: sOrg.id, p_version: v2, p_locale: "en", p_personal: true, p_for_org: false }))).toBe("ok");
    expect(await trySubmit(sourcer, sOrg.id, openJob)).toBe("ok");
  });

  it("in-flight work continues on both sides while restricted (BR-13)", async () => {
    expect(err(await transition(hirer, inflight, "accepted", hOrg.id))).toBe("ok");
    const msg = await sourcer.client.from("referral_messages").insert({ referral_id: inflight, author_id: sourcer.id, author_side: "source", body: "Still moving, thanks." });
    expect(msg.error).toBeNull();
  });

  it("any org_admin accepting lifts the restriction immediately (AC-29)", async () => {
    expect(err(await hirer.client.rpc("accept_network_rules", { p_org: hOrg.id, p_version: v2, p_locale: "en", p_personal: true, p_for_org: true }))).toBe("ok");
    expect(((await hirer.client.rpc("get_my_org_state", { p_org: hOrg.id })).data as { restriction: string | null }).restriction).toBeNull();
    const { data: terms } = await hirer.client.rpc("get_jobs_terms_state", { p_org: hOrg.id, p_job: jobId });
    expect((terms as { hidden_reason: string | null }[])[0].hidden_reason).toBeNull();
  });
});
