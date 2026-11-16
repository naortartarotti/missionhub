import { expect, test, type Browser } from "@playwright/test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { admin, createAccount, createOrg, openToReferrals, signIn, termsOf, waitForMatch, type Account } from "./support";

/**
 * N9 candidate-confirmation integrity through the UI (docs/specs/candidate-confirmation-integrity,
 * brief §7 scenarios 5, 6, 7, 8 (recruiter view), 11). The token is taken only from the captured
 * candidate email: the server must run with email "configured" and a stand-in for the Resend API that
 * writes each message to QA_EMAIL_CAPTURE_DIR (a FAIL file there makes it answer 422). Without that
 * directory these tests are skipped. QA_SERVER_LOG, when set, is the server's stdout+stderr file for
 * the log check. Local stack only (playwright.config.ts).
 */
const CAPTURE = process.env.QA_EMAIL_CAPTURE_DIR;
const SERVER_LOG = process.env.QA_SERVER_LOG;
test.skip(!CAPTURE, "needs QA_EMAIL_CAPTURE_DIR (email stand-in) on the server under test");
test.describe.configure({ mode: "serial" });

let a: Account, b: Account;
let orgA: { id: string; slug: string; name: string }, orgB: { id: string; slug: string; name: string };
const tag = () => randomUUID().slice(0, 8);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const issuedTokens: string[] = [];

function sql(query: string) {
  const url = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("sql refused: not local");
  return execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-At", "-c", query], { encoding: "utf8" }).split("\n").filter(Boolean);
}

type Mail = { to: string | string[]; subject: string; html: string; text: string; fail: boolean };
const mails = (to: string): Mail[] =>
  readdirSync(CAPTURE!).filter((f) => f.endsWith(".json")).sort()
    .map((f) => JSON.parse(readFileSync(path.join(CAPTURE!, f), "utf8")) as Mail)
    .filter((m) => [m.to].flat().includes(to));
const tokenIn = (m: Mail) => {
  const all = [...`${m.html} ${m.text}`.matchAll(/\/candidate\/([A-Za-z0-9_-]+)/g)].map((x) => x[1]);
  expect(new Set(all).size).toBe(1);
  return all[0];
};
async function nextToken(to: string, count: number) {
  await expect.poll(() => mails(to).length, { timeout: 20_000 }).toBe(count);
  const t = tokenIn(mails(to)[count - 1]);
  expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  issuedTokens.push(t);
  return t;
}

async function candidate(name: string, email: string) {
  const { data, error } = await a.client
    .from("candidates")
    .insert({
      organization_id: orgA.id, owner_id: a.id, created_by: a.id, full_name: name, email, headline: "Senior full-stack engineer",
      status: "active_for_matching", skills: ["typescript", "react", "postgresql", "aws"], seniority: "senior", years_experience: 8,
      work_arrangements: ["hybrid", "remote"], location_country: "CA", location_region: "ON", location_city: "Toronto", languages: ["english"],
    })
    .select("id")
    .single();
  if (error) throw error;
  const k = await a.client.from("candidate_consents").insert({ organization_id: orgA.id, candidate_id: data.id, kind: "processing", scope: "Recruitment services", evidence: "Synthetic E2E intake record", recorded_by: a.id });
  if (k.error) throw k.error;
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

const asUser = async (browser: Browser, acct: Account) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on("dialog", (d) => { throw new Error(`unexpected dialog: ${d.message()}`); });
  await signIn(page, acct);
  return { ctx, page };
};

/** Submits through the composer on the default candidate-confirmed path; returns the referral id. */
async function submitByEmail(browser: Browser, name: string, email: string, expectFlag: "awaiting" | "notSent") {
  const cid = await candidate(name, email);
  const jid = await job(`N9 ${name} ${tag()}`);
  await waitForMatch(cid, jid);
  const mId = (await admin().from("matches").select("id").eq("candidate_id", cid).eq("job_id", jid).single()).data!.id;
  const { ctx, page } = await asUser(browser, a);
  await page.goto(`/workspace/${orgA.slug}/opportunities/${mId}`);
  await page.getByRole("button", { name: "Submit candidate" }).click();
  await page.waitForURL(new RegExp(`/referrals/[0-9a-f-]+\\?${expectFlag}=1$`));
  const id = page.url().match(/\/referrals\/([0-9a-f-]+)\?/)![1];
  return { ctx, page, id, cid };
}

test.beforeAll(async () => {
  [a, b] = await Promise.all([createAccount("Noa N9 Sourcer"), createAccount("Kai N9 Hiring")]);
  orgA = await createOrg(a, "E2E N9 Sourcing");
  orgB = await createOrg(b, "E2E N9 Hiring");
  if (CAPTURE) rmSync(path.join(CAPTURE, "FAIL"), { force: true });
});

test("happy path: submit by candidate email, token only in the email, candidate edits and confirms, delivered (scenario 5)", async ({ browser }) => {
  const email = `n9-happy-${tag()}@example.com`;
  const { ctx, page, id } = await submitByEmail(browser, "Avery Happy-N9", email, "awaiting");
  await expect(page.getByText(`Referral created. We emailed ${email}`)).toBeVisible();
  const token = await nextToken(email, 1);
  // BR-3: not in the recruiter's URL or page.
  expect(page.url()).not.toContain(token);
  expect(await page.content()).not.toContain(token);
  await expect(page.locator("main")).toContainText(`Email sent to ${email}`);
  expect(sql(`select token_hash = '${sha(token)}' and token_issued_by = '${a.id}' and sent_at is not null from public.referral_candidate_requests where referral_id = '${id}'`)).toEqual(["t"]);
  await ctx.close();

  const cctx = await browser.newContext();
  const cp = await cctx.newPage();
  await cp.goto(`/candidate/${token}`);
  await cp.getByLabel(/headline/i).fill("Staff engineer, scheduling platforms");
  await cp.getByRole("checkbox").last().click();
  await cp.getByRole("button", { name: "Confirm and authorize" }).click();
  await expect(cp.getByRole("heading", { level: 1 })).toContainText("Referral confirmed");
  await cctx.close();

  const r = (await admin().from("referrals").select("status").eq("id", id).single()).data!;
  expect(r.status).toBe("submitted");
  const ev = sql(`select k.evidence from public.candidate_consents k join public.referral_candidate_requests q on q.consent_id = k.id where q.referral_id = '${id}'`)[0];
  expect(ev).toMatch(new RegExp(`emailed to ${email.replace(/[.+]/g, "\\$&")} \\(issued \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}, sent \\d{4}-`));
  expect(ev).toContain("Candidate updated: headline.");
});

test("decline path through the emailed link (scenario 5)", async ({ browser }) => {
  const email = `n9-decline-${tag()}@example.com`;
  const { ctx, id } = await submitByEmail(browser, "Blair Decline-N9", email, "awaiting");
  await ctx.close();
  const token = await nextToken(email, 1);
  const cctx = await browser.newContext();
  const cp = await cctx.newPage();
  await cp.goto(`/candidate/${token}`);
  await cp.getByRole("button", { name: "I'm not interested" }).click();
  await cp.getByRole("dialog").getByRole("button", { name: "Decline referral" }).click();
  await expect(cp.getByRole("heading", { level: 1 })).toContainText("Referral declined");
  await cctx.close();
  expect((await admin().from("referrals").select("status").eq("id", id).single()).data!.status).toBe("candidate_declined");
});

test("resend: the old link is dead, the new one works; the action counts the 10/h limit once (scenario 6, BR-10)", async ({ browser }) => {
  const email = `n9-resend-${tag()}@example.com`;
  const { ctx, page, id } = await submitByEmail(browser, "Casey Resend-N9", email, "awaiting");
  const t1 = await nextToken(email, 1);
  // 9 direct resends (RPC only, no email) burn 9 of the 10; the UI resend is the 10th and must succeed.
  sql(`delete from app.rate_limits where user_id = '${a.id}' and bucket = 'referral.candidate_resend'`);
  for (let i = 0; i < 9; i++) expect((await a.client.rpc("rotate_candidate_request_token", { p_referral: id, p_ttl_days: 14 })).error).toBeNull();
  await page.getByRole("button", { name: "Resend email" }).click();
  await expect(page.getByText(`Email resent to ${email}.`)).toBeVisible();
  const t2 = await nextToken(email, 2);
  expect(t2).not.toBe(t1);
  // The 11th (direct) is refused: the action consumed exactly one hit.
  expect((await a.client.rpc("rotate_candidate_request_token", { p_referral: id, p_ttl_days: 14 })).error?.message).toBe("rate_limited");
  // ...and the UI reports the limit, without killing the live link.
  await page.getByRole("button", { name: "Resend email" }).click();
  await expect(page.getByText("You're doing that too often. Wait a moment and try again.")).toBeVisible();
  await ctx.close();

  const cctx = await browser.newContext();
  const cp = await cctx.newPage();
  await cp.goto(`/candidate/${t1}`);
  await expect(cp.getByRole("heading", { level: 1 })).toContainText("Invalid link");
  await expect(cp.getByRole("button", { name: "Confirm and authorize" })).toHaveCount(0);
  await cp.goto(`/candidate/${t2}`);
  await cp.getByRole("checkbox").last().click();
  await cp.getByRole("button", { name: "Confirm and authorize" }).click();
  await expect(cp.getByRole("heading", { level: 1 })).toContainText("Referral confirmed");
  await cctx.close();
  sql(`delete from app.rate_limits where user_id = '${a.id}'`);
});

test("pre-N9 request after the migration: candidate sees 'expired', recruiter sees 'expired, resend' and recovers (scenario 8, BR-7)", async ({ browser }) => {
  const email = `n9-legacy-${tag()}@example.com`;
  const cid = await candidate("Drew Legacy-N9", email);
  const jid = await job(`N9 Legacy ${tag()}`);
  const { data } = await a.client.rpc("submit_referral_for_candidate", { p_candidate: cid, p_job: jid, p_terms_version: await termsOf(jid), p_fields: ["headline", "skills"], p_document_ids: [], p_idempotency_key: randomUUID() }).single();
  const id = data!.referral_id as string;
  const legacy = randomBytes(32).toString("base64url");
  // Exactly what BR-7 leaves: a caller-chosen hash, never issued, sent before, expired at migration time.
  sql(`update public.referral_candidate_requests set token_hash = '${sha(legacy)}', token_issued_at = null, sent_at = now() - interval '2 days', expires_at = now() where referral_id = '${id}'`);

  const cctx = await browser.newContext();
  const cp = await cctx.newPage();
  await cp.goto(`/candidate/${legacy}`);
  await expect(cp.getByRole("heading", { level: 1 })).toContainText("This link has expired");
  await expect(cp.getByRole("button", { name: "Confirm and authorize" })).toHaveCount(0);

  const { ctx, page } = await asUser(browser, a);
  await page.goto(`/workspace/${orgA.slug}/referrals/${id}`);
  await expect(page.locator("main")).toContainText(`The link sent to ${email} expired on`);
  await expect(page.locator("main")).toContainText("Resend to create a new one.");
  await page.getByRole("button", { name: "Resend email" }).click();
  await expect(page.getByText(`Email resent to ${email}.`)).toBeVisible();
  const t = await nextToken(email, 1);
  await ctx.close();

  await cp.goto(`/candidate/${legacy}`);
  await expect(cp.getByRole("heading", { level: 1 })).toContainText("Invalid link");
  await cp.goto(`/candidate/${t}`);
  await expect(cp.getByRole("button", { name: "Confirm and authorize" })).toBeVisible();
  await cctx.close();
});

test("crash between the user RPC and issuance: 'not sent yet', no email, no token; Resend issues and sends (scenario 7, R-3)", async ({ browser }) => {
  const email = `n9-crash-${tag()}@example.com`;
  sql(`revoke execute on function public.issue_candidate_request_token(uuid, uuid) from service_role`);
  let ctx, page, id: string;
  try {
    ({ ctx, page, id } = await submitByEmail(browser, "Emery Crash-N9", email, "notSent"));
  } finally {
    sql(`grant execute on function public.issue_candidate_request_token(uuid, uuid) to service_role`);
  }
  await expect(page.getByText("Referral created, but the email to the candidate was not sent.")).toBeVisible();
  await expect(page.locator("main")).toContainText(`The email to ${email} has not been sent yet.`);
  expect(mails(email)).toHaveLength(0);
  expect(sql(`select (token_hash is null and token_issued_at is null and sent_at is null)::text || '|' || coalesce(last_send_error, '') from public.referral_candidate_requests where referral_id = '${id}'`)).toEqual(["true|failed"]);
  await page.getByRole("button", { name: "Resend email" }).click();
  await expect(page.getByText(`Email resent to ${email}.`)).toBeVisible();
  const t = await nextToken(email, 1);
  await ctx!.close();
  const cctx = await browser.newContext();
  const cp = await cctx.newPage();
  await cp.goto(`/candidate/${t}`);
  await expect(cp.getByRole("button", { name: "Confirm and authorize" })).toBeVisible();
  await cctx.close();
});

test("m-2 fixed: a resend whose issuance fails shows 'not sent yet' with Resend as the primary action; Resend recovers", async ({ browser }) => {
  const email = `n9-resendfail-${tag()}@example.com`;
  const { ctx, page, id } = await submitByEmail(browser, "Finley ResendFail-N9", email, "awaiting");
  const t1 = await nextToken(email, 1);
  sql(`revoke execute on function public.issue_candidate_request_token(uuid, uuid) from service_role`);
  try {
    await page.getByRole("button", { name: "Resend email" }).click();
    await expect(page.getByText("We couldn't email the candidate. Try again in a few minutes.")).toBeVisible();
  } finally {
    sql(`grant execute on function public.issue_candidate_request_token(uuid, uuid) to service_role`);
  }
  expect(sql(`select token_hash is null from public.referral_candidate_requests where referral_id = '${id}'`)).toEqual(["t"]);
  // sent_at still holds the first send, but there is no live link (token_issued_at null).
  expect(sql(`select (sent_at is not null and token_issued_at is null)::text from public.referral_candidate_requests where referral_id = '${id}'`)).toEqual(["true"]);
  await page.reload();
  const main = page.locator("main");
  await expect(main).toContainText(`The email to ${email} has not been sent yet.`);
  await expect(main).not.toContainText(`Email sent to ${email}`);
  const resend = page.getByRole("button", { name: "Resend email" });
  await expect(resend).toHaveClass(/bg-primary/); // primary variant
  const cctx = await browser.newContext();
  const cp = await cctx.newPage();
  await cp.goto(`/candidate/${t1}`);
  await expect(cp.getByRole("heading", { level: 1 })).toContainText("Invalid link");
  // Resend now issues and sends; the page goes back to "sent" and the new link works.
  await resend.click();
  await expect(page.getByText(`Email resent to ${email}.`)).toBeVisible();
  const t2 = await nextToken(email, 2);
  await page.reload();
  await expect(main).toContainText(`Email sent to ${email}`);
  await expect(page.getByRole("button", { name: "Resend email" })).not.toHaveClass(/bg-primary/);
  await ctx.close();
  await cp.goto(`/candidate/${t2}`);
  await expect(cp.getByRole("button", { name: "Confirm and authorize" })).toBeVisible();
  await cctx.close();
});

test("email failing: 'not sent', the issued token isn't stored anywhere readable (scenario 11)", async ({ browser }) => {
  const email = `n9-fail-${tag()}@example.com`;
  writeFileSync(path.join(CAPTURE!, "FAIL"), "1");
  let id: string;
  try {
    const s = await submitByEmail(browser, "Gray Fail-N9", email, "notSent");
    id = s.id;
    await expect(s.page.getByText("Referral created, but the email to the candidate was not sent.")).toBeVisible();
    await s.ctx.close();
  } finally {
    rmSync(path.join(CAPTURE!, "FAIL"), { force: true });
  }
  const m = mails(email);
  expect(m).toHaveLength(1);
  expect(m[0].fail).toBe(true);
  issuedTokens.push(tokenIn(m[0]));
  expect(sql(`select (token_issued_at is not null and sent_at is null)::text || '|' || coalesce(last_send_error, '') from public.referral_candidate_requests where referral_id = '${id!}'`)).toEqual(["true|failed"]);
});

test("server output holds no candidate URL or token, in the sent and the failed flows (scenario 11)", async () => {
  test.skip(!SERVER_LOG || !existsSync(SERVER_LOG), "needs QA_SERVER_LOG");
  const log = readFileSync(SERVER_LOG!, "utf8");
  expect(issuedTokens.length).toBeGreaterThanOrEqual(6);
  expect(log).not.toMatch(/\/candidate\/[A-Za-z0-9_-]{20,}/);
  for (const t of issuedTokens) {
    expect(log.includes(t)).toBe(false);
    expect(log.includes(sha(t))).toBe(false);
  }
});
