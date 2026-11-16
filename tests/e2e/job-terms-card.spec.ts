import { expect, test, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { admin, createAccount, createCandidate, createJob, createOrg, signIn, termsOf, waitForMatch, type Account } from "./support";

/**
 * N2 job terms card (docs/specs/job-terms-card), QA journeys through the UI:
 *   1. B publishes a job with a terms card (AC-1, AC-7);
 *   2. A reads the card in the composer, B publishes v2 meanwhile → terms_changed → A resubmits under v2 (AC-18, AC-19, AC-23, AC-24);
 *   3. A confirms the agreement on the frozen terms (AC-34, AC-63);
 *   4. B reports the hire with I < C; both sides see the floored split (AC-39, AC-40, AC-44, AC-45, AC-51);
 *   5. a platform admin records a concierge amendment; both sides see it; non-admins get 404 (AC-58, AC-61).
 * Local stack only (playwright.config.ts asserts it).
 */
test.describe.configure({ mode: "serial" });

const tag = randomUUID().slice(0, 6);
const JOB_TITLE = `Terms Card Engineer ${tag}`;
const today = new Date().toISOString().slice(0, 10);

let a: Account, b: Account, ops: Account;
let orgA: { id: string; slug: string; name: string }, orgB: { id: string; slug: string; name: string };
let jobId: string, referralId: string, placementPath: string;

const asUser = async (browser: Browser, acct: Account, landing?: RegExp) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on("dialog", (d) => { throw new Error(`unexpected dialog: ${d.message()}`); });
  await signIn(page, acct, landing);
  return { ctx, page };
};
const referral = async (id: string) => (await admin().from("referrals").select("*").eq("id", id).single()).data!;
async function move(acct: Account, id: string, to: "accepted" | "interviewing" | "offer") {
  const { error } = await acct.client.rpc("transition_referral", { p_referral: id, p_to: to, p_reason: "", p_expected_version: (await referral(id)).version });
  if (error) throw error;
}
/** Publishes a card as the owner (the RPC is the only writer, BR-4). */
async function publish(acct: Account, job: string, over: Record<string, unknown> = {}) {
  const { error } = await acct.client.rpc("save_job_terms", {
    p_job: job, p_open: true, p_fee_basis: "pct_base", p_rate_bps: 2000, p_search_type: "contingent_shared", p_attested: true,
    p_guarantee_days: 90, p_guarantee_remedy: "replacement_then_prorata", p_payment_terms_days: 30, p_ownership_months: 6, ...over,
  } as never);
  if (error) throw error;
}

test.beforeAll(async () => {
  [a, b, ops] = await Promise.all([createAccount("Tess Sourcer"), createAccount("Omar Hiring"), createAccount("Lee Ops", { platformAdmin: true })]);
  orgA = await createOrg(a, "E2E N2 Sourcing");
  orgB = await createOrg(b, "E2E N2 Hiring");
});

test("B publishes a job with a terms card: defaults, attestation required, then version 1 (AC-1, AC-7)", async ({ browser }) => {
  const { ctx, page } = await asUser(browser, b);
  await page.goto(`/workspace/${orgB.slug}/jobs/new`);
  const card = page.locator("#terms");
  await expect(card).toContainText("Terms for partners");
  await expect(card).toContainText("Not published yet");
  await expect(page.locator("#feeRate")).toHaveValue("");
  await expect(page.getByLabel("Ownership window")).toHaveValue("6");
  await expect(page.getByLabel("Length")).toHaveValue("90");
  await expect(card).toContainText("Sourcing 45% · Hiring 45% · Platform 10%");

  await page.getByLabel("Job title").fill(JOB_TITLE);
  await page.getByLabel(/Hiring client/).fill("Northwind Health"); // N3 BR-1: a real client name to open to partners
  await page.getByRole("checkbox", { name: /Hide the client/ }).check();
  await page.locator("#requiredSkills").fill("typescript, react, postgresql");
  await page.locator("#description").fill("Build clinical scheduling tools for hospitals.");
  await page.locator("#salaryMin").fill("100000");
  await page.locator("#salaryMax").fill("120000");
  await page.locator("#feeRate").fill("20");
  // Without the T6 attestation the save is refused and nothing is created (AC-7).
  await page.getByRole("button", { name: "Publish job" }).click();
  await expect(page.getByText("Confirm you hold the fee agreement with the end client").first()).toBeVisible();
  expect((await admin().from("jobs").select("id").eq("organization_id", orgB.id).eq("title", JOB_TITLE)).data).toHaveLength(0);

  await page.getByRole("checkbox", { name: /We hold the fee agreement directly with the end client/ }).check();
  await page.getByRole("button", { name: "Publish job" }).click();
  await page.waitForURL(/\/jobs\/[0-9a-f-]{36}\?created=1/);
  jobId = (await admin().from("jobs").select("id").eq("organization_id", orgB.id).eq("title", JOB_TITLE).single()).data!.id;
  const { data: v } = await admin().from("job_terms_versions").select("*").eq("job_id", jobId);
  expect(v).toHaveLength(1);
  expect(v![0]).toMatchObject({ version_no: 1, fee_basis: "pct_base", rate_bps: 2000, currency: "CAD", ownership_months: 6, guarantee_days: 90, direct_client_attested_by: b.id });
  const job = (await admin().from("jobs").select("accepts_external_referrals, share_salary").eq("id", jobId).single()).data!;
  expect(job).toEqual({ accepts_external_referrals: true, share_salary: true });
  await expect(page.getByRole("main")).toContainText("Terms for partners");
  await ctx.close();
});

test("fix round (QA-N2-03): switching to flat after typing a minimum and choosing no guarantee publishes cleanly", async ({ browser }) => {
  const { ctx, page } = await asUser(browser, b);
  const title = `Flat Card ${tag}`;
  await page.goto(`/workspace/${orgB.slug}/jobs/new`);
  await page.getByLabel("Job title").fill(title);
  await page.getByLabel(/Hiring client/).fill("Northwind Health"); // N3 BR-1
  await page.getByRole("checkbox", { name: /Hide the client/ }).check();
  await page.locator("#requiredSkills").fill("typescript, react");
  await page.locator("#description").fill("Build clinical scheduling tools for hospitals.");
  await page.locator("#feeRate").fill("20");
  await page.locator("#minimumFee").fill("5000");
  // The minimum and the remedy are hidden now; the server refuses them if posted, so the form must not post them.
  await page.getByRole("radio", { name: /^Flat fee/ }).click();
  await page.locator("#flatFee").fill("15000");
  await page.getByLabel("Length").selectOption("0");
  await page.getByRole("checkbox", { name: /We hold the fee agreement directly with the end client/ }).check();
  await page.getByRole("button", { name: "Publish job" }).click();
  await page.waitForURL(/\/jobs\/[0-9a-f-]{36}\?created=1/);
  const id = (await admin().from("jobs").select("id").eq("organization_id", orgB.id).eq("title", title).single()).data!.id;
  const { data: v } = await admin().from("job_terms_versions").select("fee_basis, flat_fee_minor, min_fee_minor, guarantee_days, guarantee_remedy, rate_bps").eq("job_id", id).single();
  expect(v).toEqual({ fee_basis: "flat", flat_fee_minor: 1_500_000, min_fee_minor: null, guarantee_days: 0, guarantee_remedy: null, rate_bps: null });
  await ctx.close();
});

test("A reads the card; B publishes v2 while A is in the composer → terms_changed; A submits under the new terms (AC-18, AC-19, AC-24)", async ({ browser }) => {
  // Candidate after the job: the candidate-side matcher scores the pair.
  const candidateId = await createCandidate(a, orgA.id, "Rowan Terms-E2E");
  await waitForMatch(candidateId, jobId);
  const mId = (await admin().from("matches").select("id").eq("candidate_id", candidateId).eq("job_id", jobId).single()).data!.id;

  const { ctx, page } = await asUser(browser, a);
  await page.goto(`/workspace/${orgA.slug}/opportunities/${mId}`);
  const panel = page.getByRole("region", { name: "Terms for this job" }).or(page.locator("[aria-labelledby='partner-terms-title']")).first();
  await expect(panel).toContainText("20%");
  await expect(panel).toContainText("Confidential");
  await expect(panel).toContainText(/Terms version 1/);
  // share_salary on: an estimate labelled with "~" and a currency code (20% × midpoint 110,000 = 22,000; 45% = 9,900).
  await expect(panel).toContainText("CAD");
  await expect(panel).toContainText(/~\s?CAD\s?9,900/);
  await expect(page.getByRole("main")).toContainText(/You.re submitting under terms version 1/);

  await page.getByRole("radio", { name: /I already have the candidate's authorization/ }).click();
  await page.getByLabel("Evidence").fill("Candidate approved sharing by email on 2026-11-14 after reading the role summary.");
  await page.getByText("I confirmed the candidate is interested").click();

  // B changes the rate while A's composer still shows version 1.
  const v1 = await termsOf(jobId);
  await publish(b, jobId, { p_rate_bps: 2200 });
  const v2 = await termsOf(jobId);
  expect(v2).not.toBe(v1);

  await page.getByRole("button", { name: "Submit candidate" }).click();
  const alert = page.locator("#terms-changed");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("The terms for this job changed");
  await expect(alert).toBeFocused();
  await expect(panel).toContainText("22%");
  await expect(panel).toContainText(/Terms version 2/);
  await expect(page.getByLabel("Evidence")).toHaveValue(/approved sharing by email/);
  expect((await admin().from("referral_candidate_links").select("referral_id").eq("candidate_id", candidateId)).data).toHaveLength(0);

  await page.getByRole("button", { name: "Submit under new terms" }).click();
  await page.waitForURL(/\/referrals\/[0-9a-f-]{36}\?submitted=1/);
  referralId = new URL(page.url()).pathname.split("/").pop()!;
  const r = await referral(referralId);
  expect(r.terms_version_id).toBe(v2);
  expect(r.fee_estimate_minor).toBe(2_420_000); // 22% × 110,000, frozen
  await ctx.close();
});

test("A confirms the agreement on the frozen terms; B's later band change doesn't move the estimate (AC-34, AC-63)", async ({ browser }) => {
  await move(b, referralId, "accepted");
  // B hides the band and changes it after the commit: A's frozen estimate must not move.
  await b.client.from("jobs").update({ share_salary: false, salary_min: 50_000_00, salary_max: 60_000_00 }).eq("id", jobId);
  const { ctx, page } = await asUser(browser, a);
  await page.goto(`/workspace/${orgA.slug}/referrals/${referralId}`);
  await expect(page.getByRole("main")).toContainText("22%");
  await expect(page.getByRole("main")).toContainText(/~\s?CAD\s?10,890\.00/); // 45% of the frozen 24,200
  await page.getByRole("button", { name: "Review & confirm terms" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("22%");
  await expect(dialog).toContainText(/Terms version 2/);
  await expect(dialog).toContainText(/~\s?CAD\s?10,890\.00/);
  await dialog.getByRole("button", { name: "Confirm agreement" }).click();
  await expect(page.getByText("Confirmed by both parties")).toBeVisible();
  const ag = (await admin().from("collaboration_agreements").select("terms_version_id, sourcing_bps, platform_basis").eq("referral_id", referralId).single()).data!;
  expect(ag).toEqual({ terms_version_id: await termsOf(jobId), sourcing_bps: 4500, platform_basis: "collected" });
  await ctx.close();
});

test("B reports the hire with an invoiced fee below the computed fee; both sides see the floored split (AC-39, AC-40, AC-44, AC-45, AC-51)", async ({ browser }) => {
  await move(b, referralId, "interviewing");
  await move(b, referralId, "offer");
  const { ctx, page } = await asUser(browser, b);
  await page.goto(`/workspace/${orgB.slug}/referrals/${referralId}`);
  await page.getByRole("button", { name: "Record hire" }).first().click(); // N3 PD-075 rename
  const hire = page.getByRole("dialog");
  // Terms are read-only text: no currency or guarantee input (AC-39).
  await expect(hire.getByLabel("Placement fee", { exact: true })).toHaveCount(0);
  await expect(hire.getByLabel(/Guarantee \(days\)/)).toHaveCount(0);
  await expect(hire).toContainText("22%");
  await hire.getByLabel("First-year base salary (CAD)").fill("100000");
  await expect(hire.getByRole("status").first()).toContainText("CAD 22,000.00");
  await hire.getByLabel("Start date").fill(today);
  await hire.getByText("Invoiced fee is different").click();
  await hire.getByLabel("Invoiced fee (CAD)").fill("15000");
  await expect(hire).toContainText(/Difference: -\s?CAD\s?7,000\.00|Difference: −\s?CAD\s?7,000\.00/);
  // Missing reason → field error, nothing recorded.
  await hire.getByRole("button", { name: "Record hire" }).click();
  await expect(hire.getByText(/reason/i).first()).toBeVisible();
  expect((await admin().from("placements").select("id").eq("referral_id", referralId)).data).toHaveLength(0);
  await hire.getByLabel("Reason").selectOption({ label: "Client negotiated a lower fee" });
  await hire.getByRole("button", { name: "Record hire" }).click();
  await page.waitForURL(/\/commissions\/[0-9a-f-]{36}\?created=1/);
  placementPath = new URL(page.url()).pathname;
  const pl = (await admin().from("placements").select("*").eq("referral_id", referralId).single()).data!;
  expect(pl).toMatchObject({ computed_fee_minor: 2_200_000, contracted_fee_minor: 1_500_000, reported_base_minor: 10_000_000, fee_difference_reason: "client_discount", currency: "CAD" });

  const main = page.getByRole("main");
  await expect(main).toContainText("CAD 22,000.00");
  await expect(main).toContainText("CAD 15,000.00");
  await expect(main).toContainText("Client negotiated a lower fee");
  // 45/45/10 collected, C 22,000, I 15,000 → sourcing 9,900, platform 1,500, job owner 3,600.
  await expect(main).toContainText("CAD 9,900.00");
  await expect(main).toContainText("CAD 1,500.00");
  await expect(main).toContainText("CAD 3,600.00");
  await expect(main).toContainText("You invoiced less than the computed fee.");
  await ctx.close();

  const note = (await admin().from("notifications").select("user_id, body").eq("kind", "placement.fee_difference").eq("link", `/commissions/${pl.id}`)).data!;
  expect(note.map((n) => n.user_id)).toEqual([a.id]);
  expect(note[0].body).toContain("CAD 15,000.00 instead of the computed CAD 22,000.00");

  const src = await asUser(browser, a);
  await src.page.goto(placementPath.replace(`/workspace/${orgB.slug}/`, `/workspace/${orgA.slug}/`));
  const smain = src.page.getByRole("main");
  await expect(smain).toContainText("invoiced less than the computed fee");
  await expect(smain).toContainText("CAD 9,900.00");
  await expect(smain).toContainText("100,000.00"); // the reported base is visible to both orgs (AC-71)
  await src.ctx.close();
});

/** Horizontal overflow at the current viewport, with the widest offending elements for the bug report. */
async function overflowOf(page: Page) {
  await page.waitForLoadState("networkidle");
  return page.evaluate(() => {
    const over = document.scrollingElement!.scrollWidth - window.innerWidth;
    const culprits = [...document.querySelectorAll("main *")]
      .map((el) => ({ el, right: el.getBoundingClientRect().right }))
      .filter((x) => x.right > window.innerWidth + 1)
      .sort((x, y) => y.right - x.right).slice(0, 3)
      .map((x) => `${x.el.tagName.toLowerCase()}.${String((x.el as HTMLElement).className).slice(0, 90)} "${(x.el.textContent ?? "").trim().slice(0, 40)}" → ${Math.round(x.right)}px`);
    return { over, culprits };
  });
}
async function at375(browser: Browser, acct: Account, locale: string) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 900 } });
  const page = await ctx.newPage();
  await signIn(page, acct); // English labels: switch the locale only after signing in
  await ctx.addCookies([{ name: "mh-locale", value: locale, url: test.info().project.use.baseURL ?? "http://localhost:3000" }]);
  return { ctx, page };
}

test("fix round (B-2 and shared components): no horizontal scroll at 375px in en, fr and pt on the N2 screens", async ({ browser }) => {
  for (const locale of ["en", "fr", "pt"]) {
    for (const [acct, org, paths] of [
      [a, orgA, ["/opportunities", `/referrals/${referralId}`, "/referrals?tab=sent", placementPath.replace(`/workspace/${orgB.slug}`, ""), "/commissions"]],
      [b, orgB, ["/jobs", `/jobs/${jobId}/edit`, "/referrals", `/referrals/${referralId}`, placementPath.replace(`/workspace/${orgB.slug}`, "")]],
    ] as const) {
      const { ctx, page } = await at375(browser, acct, locale);
      for (const path of paths) {
        await page.goto(`/workspace/${org.slug}${path}`);
        await expect(page.getByRole("main")).toBeVisible();
        const r = await overflowOf(page);
        expect.soft(r.over, `${locale} ${acct.name} ${path}: ${r.culprits.join(" | ")}`).toBeLessThanOrEqual(1);
      }
      await ctx.close();
    }
  }
});

// QA-PRE-03 (pre-existing, frontend): the owner's job page overflows 169–208px at 375px once the job has received
// referrals: the "Candidates submitted to you" list's truncated labels sit in an unconstrained grid track
// (src/app/workspace/[orgSlug]/jobs/[jobId]/page.tsx outer grid and list). Fixed: minmax(0,1fr) tracks.
test("QA-PRE-03: the owner's job page with received referrals doesn't scroll horizontally at 375px", async ({ browser }) => {
  const { ctx, page } = await at375(browser, b, "en");
  await page.goto(`/workspace/${orgB.slug}/jobs/${jobId}`);
  const r = await overflowOf(page);
  await ctx.close();
  expect(r.over, r.culprits.join(" | ")).toBeLessThanOrEqual(1);
});

// QA-PRE-04 (pre-existing, frontend, minor): the overview pipeline bar's hover label ("Interviewing · 0 · 0% of the
// pipeline", absolutely positioned, left-0) stuck out 11px at 375px in en. Fixed: the label wraps within its track.
test("QA-PRE-04: the overview doesn't scroll horizontally at 375px (pipeline hover label)", async ({ browser }) => {
  const { ctx, page } = await at375(browser, a, "en");
  await page.goto(`/workspace/${orgA.slug}/overview`);
  const r = await overflowOf(page);
  await ctx.close();
  expect(r.over, r.culprits.join(" | ")).toBeLessThanOrEqual(1);
});

test("a platform admin records a concierge amendment; both orgs see it; non-admins get 404 (AC-58, AC-61)", async ({ browser }) => {
  const job2 = await createJob(b, orgB.id, `Amend Role ${tag}`);
  const cand = await createCandidate(a, orgA.id, "Jules Amend-E2E");
  await a.client.from("candidates").update({ email: `jules-${randomUUID().slice(0, 8)}@example.com`, phone: null }).eq("id", cand);
  const { data: consent } = await a.client.from("candidate_consents").insert({
    organization_id: orgA.id, candidate_id: cand, kind: "job_sharing", job_id: job2, scope: "Share with partner", evidence: "Email confirmation 2026-11-14", recorded_by: a.id,
  }).select("id").single();
  const { data: sub, error } = await a.client.rpc("submit_referral", {
    p_candidate: cand, p_job: job2, p_terms_version: await termsOf(job2), p_fields: ["headline", "skills"], p_document_ids: [],
    p_consent: consent!.id, p_idempotency_key: randomUUID(),
  }).single();
  if (error) throw error;
  const refId = (sub as { referral_id: string }).referral_id;
  await move(b, refId, "accepted");

  // Non-admins don't learn the admin area exists.
  const outsider = await asUser(browser, a);
  await outsider.page.goto(`/admin/referrals/${refId}`);
  await expect(outsider.page.getByRole("heading", { name: "Referral terms" })).toHaveCount(0);
  await expect(outsider.page.getByRole("main")).not.toContainText("Record an amendment");
  await outsider.ctx.close();

  const { ctx, page } = await asUser(browser, ops, /^((?!sign-in).)*$/);
  await page.goto("/admin/referrals");
  await page.getByLabel("Referral link or ID").fill(`https://app.example.test/workspace/${orgA.slug}/referrals/${refId}`);
  await page.getByRole("button", { name: "Find referral" }).click();
  await page.waitForURL(new RegExp(`/admin/referrals/${refId}`));
  await expect(page.getByRole("main")).toContainText("Confidential");
  await expect(page.getByRole("main")).not.toContainText("Northwind Health");
  // The window is locked on a delivered referral (BR-35).
  await expect(page.getByLabel("Ownership window")).toBeDisabled();
  await page.getByLabel("Length").selectOption("60");
  await page.getByRole("textbox", { name: "Reason", exact: true }).fill("Client shortened the guarantee in the signed contract.");
  await page.getByRole("textbox", { name: "Hiring organization's written request" }).fill("Email of Nov 14 from the hiring admin");
  await page.getByRole("textbox", { name: "Sourcing organization's written request" }).fill("Email of Nov 14 from the sourcing admin");
  await page.getByText("Both organizations asked for this change in writing.").click();
  await page.getByRole("button", { name: "Record amendment" }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm).toContainText("Record this terms amendment?");
  await expect(confirm).toContainText(/90 days.*60 days/);
  await confirm.getByRole("button", { name: "Record amendment" }).click();
  await expect(page.getByText("Amendment recorded. Both organizations were notified.").first()).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Client shortened the guarantee in the signed contract.");
  await ctx.close();

  const amendment = (await admin().from("job_terms_versions").select("id, guarantee_days, kind").eq("referral_id", refId).single()).data!;
  expect(amendment).toMatchObject({ kind: "amendment", guarantee_days: 60 });
  expect((await admin().from("collaboration_agreements").select("terms_version_id").eq("referral_id", refId).single()).data!.terms_version_id).toBe(amendment.id);

  for (const [acct, org] of [[a, orgA], [b, orgB]] as const) {
    const s = await asUser(browser, acct);
    await s.page.goto(`/workspace/${org.slug}/referrals/${refId}`);
    const main = s.page.getByRole("main");
    await expect(main).toContainText(/Amended on/);
    await expect(main).toContainText("60 days");
    await expect(main).toContainText("Original terms");
    // The reason and request references are admin-only (AC-61).
    await expect(main).not.toContainText("Client shortened the guarantee");
    await expect(main).not.toContainText("Email of Nov 14");
    await s.ctx.close();
  }
});

test("F-1 re-check: flat CAD → % on a USD-salaried job: the form labels, confirms and stores USD (PD-062)", async ({ browser }) => {
  const job = await createJob(b, orgB.id, `Amend Currency ${tag}`);
  await admin().from("jobs").update({ salary_currency: "USD" }).eq("id", job);
  await publish(b, job, { p_fee_basis: "flat", p_rate_bps: null, p_flat_fee_minor: 1_500_000, p_flat_currency: "CAD" });
  const cand = await createCandidate(a, orgA.id, "Rio Currency-E2E");
  await a.client.from("candidates").update({ email: `rio-${randomUUID().slice(0, 8)}@example.com`, phone: null }).eq("id", cand);
  const { data: consent } = await a.client.from("candidate_consents").insert({
    organization_id: orgA.id, candidate_id: cand, kind: "job_sharing", job_id: job, scope: "Share with partner", evidence: "Email confirmation 2026-11-16", recorded_by: a.id,
  }).select("id").single();
  const { data: sub, error } = await a.client.rpc("submit_referral", {
    p_candidate: cand, p_job: job, p_terms_version: await termsOf(job), p_fields: ["headline", "skills"], p_document_ids: [],
    p_consent: consent!.id, p_idempotency_key: randomUUID(),
  }).single();
  if (error) throw error;
  expect((sub as { outcome: string }).outcome).toBe("created");
  const refId = (sub as { referral_id: string }).referral_id;

  const { ctx, page } = await asUser(browser, ops, /^((?!sign-in).)*$/);
  await page.goto(`/admin/referrals/${refId}`);
  await page.getByRole("radio", { name: /% of base salary/ }).check();
  await page.locator("#feeRate").fill("20");
  const minimum = page.locator("#minimumFee");
  await minimum.fill("5000");
  // The minimum-fee unit is the job's salary currency, not the flat CAD.
  await expect(minimum.locator("xpath=..")).toContainText("USD");
  await expect(minimum.locator("xpath=..")).not.toContainText("CAD");
  await page.getByRole("textbox", { name: "Reason", exact: true }).fill("Both orgs moved to a percentage fee in writing.");
  await page.getByRole("textbox", { name: "Hiring organization's written request" }).fill("Email of Nov 16 from the hiring admin");
  await page.getByRole("textbox", { name: "Sourcing organization's written request" }).fill("Email of Nov 16 from the sourcing admin");
  await page.getByText("Both organizations asked for this change in writing.").click();
  await page.getByRole("button", { name: "Record amendment" }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm).toContainText("Fee currency");
  await expect(confirm).toContainText(/CAD[\s\S]*USD/);
  await expect(confirm).toContainText(/USD\s?5,000\.00/);
  await confirm.getByRole("button", { name: "Record amendment" }).click();
  await expect(page.getByText("Amendment recorded. Both organizations were notified.").first()).toBeVisible();
  await ctx.close();

  const { data: v } = await admin().from("job_terms_versions").select("fee_basis, currency, rate_bps, min_fee_minor, flat_fee_minor").eq("referral_id", refId).single();
  expect(v).toMatchObject({ fee_basis: "pct_base", currency: "USD", rate_bps: 2000, min_fee_minor: 500_000, flat_fee_minor: null });
});

test("fix round (P16): terms amended while the hire dialog is open → refused with the message, values kept; resubmitting uses the amended terms", async ({ browser }) => {
  const job = await createJob(b, orgB.id, `Amend While Open ${tag}`);
  const cand = await createCandidate(a, orgA.id, "Noor Amend-E2E");
  // support's candidates share one email and its jobs one client, so N1 would (rightly) stop a second referral.
  await a.client.from("candidates").update({ email: `noor-${randomUUID().slice(0, 8)}@example.com`, phone: null }).eq("id", cand);
  const { data: consent } = await a.client.from("candidate_consents").insert({
    organization_id: orgA.id, candidate_id: cand, kind: "job_sharing", job_id: job, scope: "Share with partner", evidence: "Email confirmation 2026-11-14", recorded_by: a.id,
  }).select("id").single();
  const { data: sub, error } = await a.client.rpc("submit_referral", {
    p_candidate: cand, p_job: job, p_terms_version: await termsOf(job), p_fields: ["headline", "skills"], p_document_ids: [],
    p_consent: consent!.id, p_idempotency_key: randomUUID(),
  }).single();
  if (error) throw error;
  expect((sub as { outcome: string }).outcome).toBe("created");
  const refId = (sub as { referral_id: string }).referral_id;
  await move(b, refId, "accepted");
  const conf = await a.client.rpc("confirm_agreement", { p_referral: refId });
  if (conf.error) throw conf.error;
  await move(b, refId, "interviewing");
  await move(b, refId, "offer");

  const { ctx, page } = await asUser(browser, b);
  await page.goto(`/workspace/${orgB.slug}/referrals/${refId}`);
  await page.getByRole("button", { name: "Record hire" }).first().click(); // N3 PD-075 rename
  const hire = page.getByRole("dialog");
  await hire.getByLabel("First-year base salary (CAD)").fill("100000");
  await hire.getByLabel("Start date").fill(today);
  await expect(hire.getByRole("status").first()).toContainText("CAD 20,000.00");

  // A platform admin records an amendment (20% → 15%) while the dialog is open.
  const am = await ops.client.rpc("admin_amend_referral_terms", {
    p_referral: refId, p_reason: "Client renegotiated the fee in writing.", p_hiring_request_reference: "Email of Nov 15 from B",
    p_sourcing_request_reference: "Email of Nov 15 from A", p_both_requested: true, p_fee_basis: "pct_base", p_rate_bps: 1500,
    p_search_type: "contingent_shared", p_guarantee_days: 90, p_guarantee_remedy: "replacement_then_prorata", p_payment_terms_days: 30, p_ownership_months: 6,
  } as never);
  if (am.error) throw am.error;

  await hire.getByRole("button", { name: "Record hire" }).click();
  await expect(hire.getByText("This referral's terms were amended while this form was open.", { exact: false })).toBeVisible();
  expect((await admin().from("placements").select("id").eq("referral_id", refId)).data).toHaveLength(0);
  await expect(hire.getByLabel("First-year base salary (CAD)")).toHaveValue("100000");
  // After the automatic refresh the dialog computes on the amended 15%.
  await expect(hire.getByRole("status").first()).toContainText("CAD 15,000.00");
  await hire.getByRole("button", { name: "Record hire" }).click();
  await page.waitForURL(/\/commissions\/[0-9a-f-]{36}\?created=1/);
  const pl = (await admin().from("placements").select("computed_fee_minor, terms_version_id").eq("referral_id", refId).single()).data!;
  expect(pl.computed_fee_minor).toBe(1_500_000);
  expect(pl.terms_version_id).toBe((am.data as string));
  await ctx.close();
});

test("a job that stops being partner-visible: its composer URL is not found and it leaves the opportunities list (AC-16)", async ({ browser }) => {
  const job3 = await createJob(b, orgB.id, `Hidden Role ${tag}`);
  const cand = await createCandidate(a, orgA.id, "Sky Hidden-E2E");
  await waitForMatch(cand, job3);
  const mId = (await admin().from("matches").select("id").eq("candidate_id", cand).eq("job_id", job3).single()).data!.id;
  const { error } = await b.client.from("jobs").update({ contract_type: "contract" }).eq("id", job3);
  if (error) throw error;
  const { ctx, page } = await asUser(browser, a);
  await page.goto(`/workspace/${orgA.slug}/opportunities/${mId}`);
  await expectNotFound(page);
  await page.goto(`/workspace/${orgA.slug}/opportunities`);
  await expect(page.getByRole("main")).not.toContainText(`Hidden Role ${tag}`);
  await ctx.close();
});

async function expectNotFound(page: Page) {
  await expect(page.getByText(/This page isn.t available|not found/i).first()).toBeVisible();
}
