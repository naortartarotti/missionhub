import { expect, test, type Browser } from "@playwright/test";
import { createAccount, createCandidate, createJob, createOrg, signIn, waitForMatch, type Account } from "./support";

test.describe.configure({ mode: "serial" });

const CANDIDATE_NAME = "Quinn Lavoie-E2E";
const JOB_TITLE = `Senior Platform Engineer ${Date.now().toString(36)}`;

let a: Account, b: Account, ops: Account;
let placementPath: string;
const today = new Date().toISOString().slice(0, 10);
let orgA: { id: string; slug: string }, orgB: { id: string; slug: string };
let candidateId: string;
let referralUrl: string;

const asUser = async (browser: Browser, acct: Account) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, acct);
  return { ctx, page };
};

test.beforeAll(async () => {
  [a, b, ops] = await Promise.all([createAccount("Riley Sourcer"), createAccount("Jordan Owner"), createAccount("Casey Ops", { platformAdmin: true })]);
  orgA = await createOrg(a, "E2E Sourcing Co");
  orgB = await createOrg(b, "E2E Hiring Partners");
  candidateId = await createCandidate(a, orgA.id, CANDIDATE_NAME);
  const jobId = await createJob(b, orgB.id, JOB_TITLE);
  await waitForMatch(candidateId, jobId);
});

test("A finds the partner opportunity and submits with a recorded authorization", async ({ browser }) => {
  const { ctx, page } = await asUser(browser, a);
  await page.goto(`/workspace/${orgA.slug}/opportunities`);
  const card = page.locator("article, li, div").filter({ hasText: JOB_TITLE }).filter({ has: page.getByRole("link", { name: /Review/ }) }).last();
  await expect(card).toContainText(CANDIDATE_NAME);
  await card.getByRole("link", { name: /Review/ }).first().click();
  await expect(page.getByRole("heading", { name: "Review match & submit" })).toBeVisible();

  // Submitting without confirming interest is rejected and keeps the form.
  await page.getByLabel("Evidence").fill("Candidate approved sharing by email on 2026-11-07 after reading the role summary.");
  await page.getByRole("button", { name: "Submit candidate" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.getByLabel("Evidence")).toHaveValue(/approved sharing by email/);

  await page.getByText("I confirmed the candidate is interested").click();
  await page.getByRole("button", { name: "Submit candidate" }).click();
  await page.waitForURL(/\/referrals\/[0-9a-f-]+\?submitted=1/);
  await expect(page.getByText(/has been notified/)).toBeVisible();
  referralUrl = new URL(page.url()).pathname;
  await ctx.close();
});

test("B sees only the approved snapshot, then accepts", async ({ browser }) => {
  const { ctx, page } = await asUser(browser, b);
  await page.goto(`/workspace/${orgB.slug}/referrals`);
  // Pending submissions make "Received" the default tab.
  await expect(page.getByRole("link", { name: "Received" })).toHaveAttribute("aria-current", "page");
  // Received referrals are grouped by job: one region per job, one list item per referral.
  const group = page.getByRole("region", { name: JOB_TITLE });
  const item = group.getByRole("listitem").first();
  await expect(item).toContainText("E2E Sourcing Co");
  await item.getByRole("link").first().click();
  await expect(page.getByText(JOB_TITLE).first()).toBeVisible();
  const body = page.locator("main");
  await expect(body).not.toContainText(CANDIDATE_NAME);
  await expect(body).not.toContainText("e2e-candidate@example.com");
  await expect(body).not.toContainText("555 0199");

  // The review panel offers Accept / Ask for info / Decline directly (no separate "Start review" step).
  await page.waitForURL(/[?&]r=/);
  const referralId = new URL(page.url()).searchParams.get("r");
  expect(referralId).toBeTruthy();
  await page.getByRole("button", { name: "Accept" }).click();
  // Accepting moves the referral out of "To review" (the panel closes); the full page shows the agreement status.
  await expect(page.getByRole("link", { name: /In process/ })).toContainText("1");
  await page.goto(`/workspace/${orgB.slug}/referrals/${referralId}`);
  await expect(page.getByText("Accepted").first()).toBeVisible();
  await expect(page.getByText("Awaiting sourcing recruiter")).toBeVisible();
  await ctx.close();
});

test("B cannot open A's candidate record or A's workspace", async ({ browser }) => {
  const { ctx, page } = await asUser(browser, b);
  await page.goto(`/workspace/${orgB.slug}/candidates/${candidateId}`);
  await expect(page.getByText("This page isn't available")).toBeVisible();
  await page.goto(`/workspace/${orgA.slug}/overview`);
  await expect(page.getByText("This page isn't available")).toBeVisible();
  await ctx.close();
});

test("A confirms the frozen 45/45/10 agreement", async ({ browser }) => {
  const { ctx, page } = await asUser(browser, a);
  await page.goto(referralUrl);
  await expect(page.getByText("45%").first()).toBeVisible();
  await expect(page.getByText("10%").first()).toBeVisible();
  await page.getByRole("button", { name: "Review & confirm terms" }).click();
  await page.getByRole("button", { name: "Confirm agreement" }).click();
  await expect(page.getByText("Confirmed by both parties")).toBeVisible();
  await ctx.close();
});

const verifyInAdmin = async (browser: Browser, reference: string) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, ops, /^((?!sign-in).)*$/);
  await page.goto("/admin");
  const item = page.getByRole("listitem").filter({ hasText: reference });
  await item.getByRole("button", { name: "Verify" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Verification note").fill("Matched against the bank statement.");
  await dialog.getByRole("button", { name: "Verify" }).click();
  await expect(item).toHaveCount(0);
  await ctx.close();
};

const recordEvidence = async (page: import("@playwright/test").Page, button: string, kind: string, amount: string, reference: string) => {
  await page.getByRole("button", { name: button }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Type").selectOption({ label: kind });
  await dialog.getByLabel(/^Amount/).fill(amount);
  await dialog.getByLabel("Date received / sent").fill(today);
  await dialog.getByLabel("Bank or transfer reference").fill(reference);
  await dialog.getByRole("button", { name: "Record evidence" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(reference)).toBeVisible();
};

test("B moves the candidate to offer, reports the hire and invoices the client", async ({ browser }) => {
  const { ctx, page } = await asUser(browser, b);
  await page.goto(referralUrl.replace(`/workspace/${orgA.slug}/`, `/workspace/${orgB.slug}/`));
  await page.getByRole("button", { name: "Move to interviewing" }).click();
  await expect(page.getByText("Interviewing").first()).toBeVisible();
  await page.getByRole("button", { name: "Record offer" }).click();
  await expect(page.getByRole("button", { name: "Report hire" })).toBeVisible();

  await page.getByRole("button", { name: "Report hire" }).click();
  const hire = page.getByRole("dialog");
  await hire.getByLabel("Contracted placement fee").fill("20000");
  await hire.getByLabel("Start date").fill(today);
  await hire.getByRole("button", { name: "Record hire" }).click();
  await page.waitForURL(/\/wallet\/placements\/[0-9a-f-]+\?created=1/);
  placementPath = new URL(page.url()).pathname;
  await expect(page.getByText("Hire reported").first()).toBeVisible();

  await page.getByRole("button", { name: "Record client invoice" }).click();
  const inv = page.getByRole("dialog");
  await inv.getByLabel("Invoice number").fill("E2E-INV-001");
  await inv.getByLabel("Issued").fill(today);
  await inv.getByRole("button", { name: "Record invoice" }).click();
  await expect(inv).toHaveCount(0);
  await expect(page.getByText("Invoiced").first()).toBeVisible();

  await recordEvidence(page, "Record client payment", "Client payment received", "20000", "E2E-WIRE-CLIENT");
  await ctx.close();
});

test("a platform admin verifies the client payment; shares become payable to the cent", async ({ browser }) => {
  await verifyInAdmin(browser, "E2E-WIRE-CLIENT");
  const { ctx, page } = await asUser(browser, a);
  await page.goto(placementPath.replace(`/workspace/${orgB.slug}/`, `/workspace/${orgA.slug}/`));
  await expect(page.getByText("Commission payable").first()).toBeVisible();
  await expect(page.getByRole("main")).toContainText("9,000.00");
  await expect(page.getByRole("main")).toContainText("2,000.00");
  await ctx.close();
});

test("payouts need verification by someone other than the recorder, then the placement settles", async ({ browser }) => {
  const owner = await asUser(browser, b);
  await owner.page.goto(placementPath);
  await recordEvidence(owner.page, "Record payout / remittance", "Payout to sourcing recruiter", "9000", "E2E-WIRE-PAYOUT");
  // Four-eyes: the recorder is not offered a Verify button for their own evidence.
  await expect(owner.page.getByRole("listitem").filter({ hasText: "E2E-WIRE-PAYOUT" }).getByRole("button", { name: "Verify" })).toHaveCount(0);
  await recordEvidence(owner.page, "Record payout / remittance", "Platform share remittance", "2000", "E2E-WIRE-PLATFORM");

  const sourcer = await asUser(browser, a);
  await sourcer.page.goto(placementPath.replace(`/workspace/${orgB.slug}/`, `/workspace/${orgA.slug}/`));
  const payout = sourcer.page.getByRole("listitem").filter({ hasText: "E2E-WIRE-PAYOUT" });
  await payout.getByRole("button", { name: "Verify" }).click();
  await sourcer.page.getByRole("dialog").getByRole("button", { name: "Verify" }).click();
  await expect(payout).toContainText("Verified");

  await verifyInAdmin(browser, "E2E-WIRE-PLATFORM");
  await sourcer.page.reload();
  await expect(sourcer.page.getByText("Settled").first()).toBeVisible();
  await owner.ctx.close();
  await sourcer.ctx.close();
});
