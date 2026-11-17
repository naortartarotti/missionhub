import { expect, test, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { admin, createAccount, createOrg, openToReferrals, signIn, termsOf, waitForMatch, type Account } from "./support";

/**
 * N1 main journeys through the UI (docs/specs/duplicate-prior-presentation): stop, two-step pending
 * warning, objection with a file, contest, admin reject, release later. State that isn't under test
 * is seeded through PostgREST as the acting user (local stack only, see playwright.config.ts).
 * Needs the app and the worker (evidence scan + matching) running against the LOCAL stack.
 */
test.describe.configure({ mode: "serial" });

let a: Account, a1: Account, b: Account, ops: Account;
let orgA: { id: string; slug: string; name: string }, orgA1: { id: string; slug: string; name: string }, orgB: { id: string; slug: string; name: string };
const tag = () => randomUUID().slice(0, 8);

async function candidate(acct: Account, orgId: string, name: string, email: string) {
  const { data, error } = await acct.client
    .from("candidates")
    .insert({
      organization_id: orgId, owner_id: acct.id, created_by: acct.id, full_name: name, email, headline: "Senior full-stack engineer",
      status: "active_for_matching", skills: ["typescript", "react", "postgresql", "aws"], seniority: "senior", years_experience: 8,
      work_arrangements: ["hybrid", "remote"], location_country: "CA", location_region: "ON", location_city: "Toronto", languages: ["english"],
    })
    .select("id")
    .single();
  if (error) throw error;
  const { error: cErr } = await acct.client.from("candidate_consents").insert({
    organization_id: orgId, candidate_id: data.id, kind: "processing", scope: "Recruitment services", evidence: "Synthetic E2E intake record", recorded_by: acct.id,
  });
  if (cErr) throw cErr;
  return data.id;
}

async function job(title: string) {
  const { data, error } = await b.client
    .from("jobs")
    .insert({
      organization_id: orgB.id, owner_id: b.id, created_by: b.id, title, client_name: `Northwind ${tag()}`, client_confidential: true,
      description: "Build clinical scheduling tools.", status: "active",
      required_skills: ["typescript", "react", "postgresql"], preferred_skills: ["aws"], seniority: "senior", min_years_experience: 5,
      work_arrangement: "hybrid", location_country: "CA", location_region: "ON", languages: ["english"], expected_fee_minor: 2_000_000,
    })
    .select("id")
    .single();
  if (error) throw error;
  await openToReferrals(b.client, data.id);
  return data.id;
}

/** Recorded-authorization submission through the RPC (seeding only). */
async function deliver(acct: Account, orgId: string, candidateId: string, jobId: string) {
  const { data: consent, error: cErr } = await acct.client
    .from("candidate_consents")
    .insert({ organization_id: orgId, candidate_id: candidateId, kind: "job_sharing", job_id: jobId, scope: "Share with partner", evidence: "Email confirmation", recorded_by: acct.id })
    .select("id")
    .single();
  if (cErr) throw cErr;
  const { data, error } = await acct.client
    .rpc("submit_referral", { p_candidate: candidateId, p_job: jobId, p_terms_version: await termsOf(jobId), p_fields: ["headline", "skills"], p_document_ids: [], p_consent: consent.id, p_idempotency_key: randomUUID() })
    .single();
  if (error) throw error;
  expect(data.outcome).toBe("created");
  return data.referral_id as string;
}

async function pending(acct: Account, candidateId: string, jobId: string) {
  const { data, error } = await acct.client
    .rpc("submit_referral_for_candidate", {
      p_candidate: candidateId, p_job: jobId, p_terms_version: await termsOf(jobId), p_fields: ["headline", "skills"], p_document_ids: [], p_idempotency_key: randomUUID(),
    })
    .single();
  if (error) throw error;
  // N9: the real server-issued token, through the service-role path the Server Action uses.
  const issued = await admin().rpc("issue_candidate_request_token", { p_referral: data.referral_id as string, p_actor: acct.id });
  if (issued.error) throw issued.error;
  return { id: data.referral_id as string, token: issued.data as string };
}

const matchId = async (candidateId: string, jobId: string) => {
  await waitForMatch(candidateId, jobId);
  return (await admin().from("matches").select("id").eq("candidate_id", candidateId).eq("job_id", jobId).single()).data!.id;
};

const asUser = async (browser: Browser, acct: Account) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // Any script dialog means injected markup executed (XSS).
  page.on("dialog", (d) => { throw new Error(`unexpected dialog: ${d.message()}`); });
  await signIn(page, acct);
  return { ctx, page };
};

async function submitRecorded(page: Page) {
  await page.getByRole("radio", { name: /I already have the candidate's authorization/ }).click();
  await page.getByLabel("Evidence").fill("Candidate approved sharing by email on 2026-11-12 after reading the role summary.");
  await page.getByText("I confirmed the candidate is interested").click();
  await page.getByRole("button", { name: "Submit candidate" }).click();
}

test.beforeAll(async () => {
  [a, a1, b, ops] = await Promise.all([
    createAccount("Noa Sourcer"), createAccount("Ari Rival"), createAccount("Kai Hiring"), createAccount("Sam Ops", { platformAdmin: true }),
  ]);
  orgA = await createOrg(a, "E2E N1 Sourcing");
  orgA1 = await createOrg(a1, "E2E N1 Rival");
  orgB = await createOrg(b, "E2E N1 Hiring");
});

test("stop: a presented candidate is stopped in the composer with the neutral message and a support reference", async ({ browser }) => {
  const shared = `stop-${tag()}@example.com`;
  const jobId = await job(`N1 Stop ${tag()}`);
  await deliver(a1, orgA1.id, await candidate(a1, orgA1.id, "Rival Copy", shared), jobId);
  const mine = await candidate(a, orgA.id, "Morgan Stop-E2E", shared);
  const mId = await matchId(mine, jobId);

  const { ctx, page } = await asUser(browser, a);
  await page.goto(`/workspace/${orgA.slug}/opportunities/${mId}`);
  // Candidate-confirmed path (the default): stopped before any email goes out.
  await page.getByRole("button", { name: "Submit candidate" }).click();
  await expect(page.getByText("Candidate already presented")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/opportunities/${mId}$`));
  const panel = page.locator("main");
  await expect(panel).toContainText(`has already been presented to ${orgB.name} for this client`);
  await expect(panel).toContainText(`Nothing was sent to the candidate or to ${orgB.name}.`);
  await expect(panel).not.toContainText(orgA1.name);
  await expect(panel).not.toContainText(/can.t be hired/i);
  const support = page.getByRole("link", { name: "Contact Workatent support" });
  const href = (await support.getAttribute("href"))!;
  expect(href).toMatch(/^mailto:support@example\.test\?subject=Stopped(%20|\+)referral(%20|\+)\d{1,8}$/);
  expect(href).not.toMatch(/body=/);
  // Nothing was created.
  expect((await a.client.from("referral_candidate_links").select("referral_id").eq("candidate_id", mine)).data).toHaveLength(0);
  await ctx.close();
});

test("two-step warning: pending referral → warning, Submit anyway disabled until acknowledged, then created", async ({ browser }) => {
  const shared = `warn-${tag()}@example.com`;
  const jobId = await job(`N1 Warn ${tag()}`);
  await pending(a1, await candidate(a1, orgA1.id, "Rival Pending", shared), jobId);
  const mine = await candidate(a, orgA.id, "Robin Warn-E2E", shared);
  const mId = await matchId(mine, jobId);

  const { ctx, page } = await asUser(browser, a);
  await page.goto(`/workspace/${orgA.slug}/opportunities/${mId}`);
  await submitRecorded(page);
  await expect(page.getByText(`This candidate may already be in process with ${orgB.name}`)).toBeVisible();
  const anyway = page.getByRole("button", { name: "Submit anyway" });
  await expect(anyway).toBeDisabled();
  expect((await a.client.from("referral_candidate_links").select("referral_id").eq("candidate_id", mine)).data).toHaveLength(0);
  await page.getByText("I understand and want to submit this referral anyway.").click();
  await expect(anyway).toBeEnabled();
  await anyway.click();
  await page.waitForURL(/\/referrals\/[0-9a-f-]+\?submitted=1/);
  await ctx.close();
});

let claimed: string;
const NOTE = `<img src=x onerror=alert('note')> In our ATS since September ${tag()}`;

test("objection with a file: B uploads a PDF, waits for the scan, files the objection", async ({ browser }) => {
  const jobId = await job(`N1 Claim ${tag()}`);
  claimed = await deliver(a, orgA.id, await candidate(a, orgA.id, "Taylor Claim-E2E", `claim-${tag()}@example.com`), jobId);
  const { ctx, page } = await asUser(browser, b);
  await page.goto(`/workspace/${orgB.slug}/referrals/${claimed}`);
  await page.getByRole("button", { name: "File objection" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("File a prior-presentation objection")).toBeVisible();
  await expect(dialog).toContainText("ET");
  // Submit is disabled with a reason until a file is ready.
  const submit = dialog.getByRole("button", { name: "Decline and file objection" });
  await expect(submit).toBeDisabled();
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "ats-export.pdf", mimeType: "application/pdf",
    buffer: Buffer.from(`%PDF-1.4\n% e2e ${tag()}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`),
  });
  await expect(dialog.getByText(/Ready · /).first()).toBeVisible({ timeout: 45_000 });
  const delivered = (await admin().from("referrals").select("delivered_at").eq("id", claimed).single()).data!.delivered_at!;
  const prior = new Date(new Date(delivered).getTime() - 20 * 86_400_000).toISOString().slice(0, 10);
  await dialog.getByLabel("Date the candidate was last in process with this client").fill(prior);
  await dialog.getByLabel("Note (optional)").fill(NOTE);
  await dialog.getByText(/^I confirm this objection and its evidence are true and accurate/).click();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(dialog).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator("main").getByText("Prior-presentation objection").first()).toBeVisible();
  await expect(page.locator("main").getByText("ats-export.pdf").first()).toBeVisible(); // the hiring side sees its file name
  expect((await admin().from("referrals").select("status, decline_reason").eq("id", claimed).single()).data).toEqual({ status: "declined", decline_reason: "prior_presentation" });
  await ctx.close();
});

test("contest: the sourcing side sees metadata and SHA only, then contests", async ({ browser }) => {
  const { ctx, page } = await asUser(browser, a);
  await page.goto(`/workspace/${orgA.slug}/referrals/${claimed}`);
  const main = page.locator("main");
  await expect(main).toContainText("Prior-presentation objection");
  await expect(main).toContainText("File 1");
  await expect(main).toContainText(/[0-9a-f]{64}/);
  await expect(main).not.toContainText("ats-export.pdf");
  await expect(main).toContainText(NOTE); // rendered as text, not markup
  await expect(page.locator("main img[src='x']")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Download/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Contest objection" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Only Workatent platform admins read this.");
  await dialog.getByLabel("Why do you disagree with the objection?").fill("We introduced this candidate first <script>alert('reason')</script>.");
  await dialog.getByRole("button", { name: "Contest objection" }).click();
  await expect(main).toContainText(/Contested on /);
  await ctx.close();
});

test("admin reject: the objection is rejected; the referral goes back to the hiring side with the chip", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on("dialog", (d) => { throw new Error(`unexpected dialog: ${d.message()}`); });
  await signIn(page, ops, /^((?!sign-in).)*$/);
  await page.goto("/admin/disputes");
  const card = page.locator("li, article, section").filter({ hasText: `Objection from ${orgB.name}` }).filter({ has: page.getByRole("button", { name: "Reject objection" }) }).last();
  await expect(card).toContainText("We introduced this candidate first <script>alert('reason')</script>.");
  await expect(card).not.toContainText("Taylor Claim-E2E"); // no candidate name or label for admins (PD-024)
  await expect(card).not.toContainText(/Same person/); // file evidence: no same-person block
  await expect(card).toContainText(/Resolve by/);
  await expect(card).toContainText(/ET · (\d+ business days? left|Ends today)/); // BusinessDeadline with resolve_by_business_days_left
  await card.getByRole("button", { name: "Reject objection" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("The ATS export doesn't show this candidate before delivery.");
  await dialog.getByRole("button", { name: "Reject objection" }).click();
  await expect(page.getByText("Objection rejected. The referral is back in review, and both organizations were notified.")).toBeVisible();
  await ctx.close();

  const hiring = await asUser(browser, b);
  await hiring.page.goto(`/workspace/${orgB.slug}/referrals/${claimed}`);
  await expect(hiring.page.locator("main")).toContainText(/Objection rejected on/);
  await expect(hiring.page.locator("main")).toContainText("Workatent admin"); // timeline actor for the admin decision (m-7)
  await expect(hiring.page.getByRole("button", { name: "File objection" })).toHaveCount(0);
  await expect(hiring.page.locator("main")).not.toContainText("We introduced this candidate first"); // contest reason: admins only
  await hiring.ctx.close();
});

test("release later: two explicit steps; the hiring side still sees Withdrawn and nothing about the release", async ({ browser }) => {
  const shared = `rel-${tag()}@example.com`;
  const jobId = await job(`N1 Freed ${tag()}`);
  const id = await deliver(a, orgA.id, await candidate(a, orgA.id, "Jamie Freed-E2E", shared), jobId);
  const v = (await admin().from("referrals").select("version").eq("id", id).single()).data!.version;
  const w = await a.client.rpc("withdraw_referral", { p_referral: id, p_reason: "Candidate paused the search", p_expected_version: v, p_acting_org: orgA.id });
  expect(w.error).toBeNull();

  const { ctx, page } = await asUser(browser, a);
  await page.goto(`/workspace/${orgA.slug}/referrals/${id}`);
  await page.getByRole("button", { name: "Release candidate" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Release this candidate for this client?")).toBeVisible();
  // Step 1 alone releases nothing: Cancel / Escape.
  await page.keyboard.press("Escape");
  expect((await a.client.rpc("get_referral_presentation", { p_referral: id, p_acting_org: orgA.id })).data).toMatchObject({ ownership_state: "protected" });
  await page.getByRole("button", { name: "Release candidate" }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(dialog.getByText("Release permanently?")).toBeVisible();
  await dialog.getByRole("button", { name: "Back" }).click();
  await expect(dialog.getByText("Release this candidate for this client?")).toBeVisible();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: "Release permanently" }).click();
  await expect(page.locator("main")).toContainText(/Released on /);
  await expect(page.getByRole("button", { name: "Release candidate" })).toHaveCount(0);
  await ctx.close();

  const hiring = await asUser(browser, b);
  await hiring.page.goto(`/workspace/${orgB.slug}/referrals/${id}`);
  const main = hiring.page.locator("main");
  await expect(main).toContainText("Withdrawn");
  // N3 BR-35 / AC-76: B's ownership line always carries "unless the sourcing recruiter released the candidate",
  // identical with or without a release; nothing else about the release reaches B.
  await expect(main).not.toContainText(/Released on|Release candidate|was released/i);
  await expect(main).toContainText(/Protected while in progress and until .* ET, unless the sourcing recruiter released the candidate\./);
  await hiring.ctx.close();

  // A second partner can now submit the same person.
  const rival = await candidate(a1, orgA1.id, "Rival After Release", shared);
  expect(await deliver(a1, orgA1.id, rival, jobId)).toBeTruthy();
});

test("candidate page: a closed referral shows 'already sent' on every reopen (AC-69)", async ({ browser }) => {
  const shared = `sent-${tag()}@example.com`;
  const jobId = await job(`N1 Sent ${tag()}`);
  const p = await pending(a, await candidate(a, orgA.id, "Casey Sent-E2E", shared), jobId);
  await deliver(a1, orgA1.id, await candidate(a1, orgA1.id, "Rival Sent", shared), jobId).catch(() => null);
  // A1 got a pending warning (no referral); acknowledge to deliver.
  const { data: c2 } = await a1.client.from("candidates").select("id").eq("email", shared).limit(1).single();
  const { data: k } = await a1.client.from("candidate_consents").insert({ organization_id: orgA1.id, candidate_id: c2!.id, kind: "job_sharing", job_id: jobId, scope: "Share", evidence: "Email confirmation", recorded_by: a1.id }).select("id").single();
  const r = await a1.client.rpc("submit_referral", { p_candidate: c2!.id, p_job: jobId, p_terms_version: await termsOf(jobId), p_fields: ["skills"], p_document_ids: [], p_consent: k!.id, p_idempotency_key: randomUUID(), p_acknowledge_pending: true }).single();
  expect(r.data?.outcome).toBe("created");

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/candidate/${p.token}`);
  await page.getByRole("checkbox").last().click();
  await page.getByRole("button", { name: "Confirm and authorize" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/already sent/i);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/already sent/i);
  await expect(page.getByRole("button", { name: "Confirm and authorize" })).toHaveCount(0);
  await ctx.close();
});
