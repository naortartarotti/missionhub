import { expect, test, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { admin, createAccount, createOrg, openToReferrals, signIn, termsOf, type Account } from "./support";

/**
 * N3 journeys through the UI (docs/specs/referral-claims-two-sided-hire, QA pass):
 *  1. A files a hire report in the dialog (XSS text in the statement); B reads the panel without links and contests
 *     "not this client"; A sees only "Not this client." (no client name, no B statement).
 *  2. B records a hire on a declined referral with the flag off (V4): record-only result.
 *  3. Admin upholds an unanswered report from /admin/hire-reports (flag on, never-accepted referral) → fee-pending
 *     placement; B enters the fee details.
 * Seeding goes through PostgREST as the acting user; the closed `app` schema (flag, clocks) through local psql only.
 */
test.describe.configure({ mode: "default" });

let a: Account, b: Account, ops: Account;
let orgA: { id: string; slug: string; name: string }, orgB: { id: string; slug: string; name: string };
const tag = () => randomUUID().slice(0, 8);
const CLIENT = `Zyxw Hidden Client ${tag()}`;

function sql(query: string): string[] {
  const url = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("sql() refused: not local");
  return execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-At", "-c", query], { encoding: "utf8" }).split("\n").filter(Boolean);
}
const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const daysAgo = (n: number) => ymd(new Date(Date.now() - n * 86_400_000));

async function candidate(name: string) {
  const { data, error } = await a.client.from("candidates").insert({
    organization_id: orgA.id, owner_id: a.id, created_by: a.id, full_name: name, email: `n3e2e-${tag()}@example.com`, headline: "Senior engineer",
    status: "active_for_matching", skills: ["typescript"], seniority: "senior", years_experience: 8, work_arrangements: ["hybrid"],
    location_country: "CA", location_region: "ON", location_city: "Toronto", languages: ["english"],
  }).select("id").single();
  if (error) throw error;
  await a.client.from("candidate_consents").insert({ organization_id: orgA.id, candidate_id: data.id, kind: "processing", scope: "Recruitment services", evidence: "Synthetic", recorded_by: a.id });
  return data.id;
}
async function job(title: string, client = CLIENT) {
  const { data, error } = await b.client.from("jobs").insert({
    organization_id: orgB.id, owner_id: b.id, created_by: b.id, title, client_name: client, client_confidential: true, description: "QA job.",
    status: "active", required_skills: ["typescript"], preferred_skills: [], seniority: "senior", min_years_experience: 5, work_arrangement: "hybrid",
    location_country: "CA", location_region: "ON", languages: ["english"], expected_fee_minor: 2_000_000,
  }).select("id").single();
  if (error) throw error;
  await openToReferrals(b.client, data.id);
  return data.id;
}
async function referral(title: string) {
  const jobId = await job(title);
  const cand = await candidate(`Cand ${tag()}`);
  const { data: consent, error: cErr } = await a.client.from("candidate_consents")
    .insert({ organization_id: orgA.id, candidate_id: cand, kind: "job_sharing", job_id: jobId, scope: "Share", evidence: "Email", recorded_by: a.id }).select("id").single();
  if (cErr) throw cErr;
  const { data, error } = await a.client.rpc("submit_referral", { p_candidate: cand, p_job: jobId, p_terms_version: await termsOf(jobId), p_fields: ["headline", "skills"],
    p_document_ids: [], p_consent: consent.id, p_idempotency_key: randomUUID() }).single();
  if (error) throw error;
  return data.referral_id as string;
}
async function page(browser: Browser, acct: Account, landing?: RegExp): Promise<Page> {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  p.on("dialog", (d) => { throw new Error(`unexpected browser dialog (XSS?): ${d.message()}`); });
  await signIn(p, acct, landing);
  return p;
}
const xssFired = (p: Page) => p.evaluate(() => (window as unknown as { __xss?: number }).__xss ?? null);

test.beforeAll(async () => {
  a = await createAccount("N3 Source");
  b = await createAccount("N3 Hiring");
  ops = await createAccount("N3 Ops", { platformAdmin: true });
  orgA = await createOrg(a, `N3 Agency ${tag()}`);
  orgB = await createOrg(b, `N3 Client Co ${tag()}`);
});
test.afterAll(() => { sql(`update app.platform_settings set value = 'false'::jsonb where key = 'deemed_agreement_enabled'`); });

test("A files a hire report; B sees text (no XSS, no links) and contests 'not this client'; A sees only 'Not this client.'", async ({ browser }) => {
  const rid = await referral(`N3 Report ${tag()}`);
  const xss = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script> The candidate's profile shows the new role.`;
  const pa = await page(browser, a);
  await pa.goto(`/workspace/${orgA.slug}/referrals/${rid}`);
  await pa.getByRole("button", { name: "Report a hire" }).click();
  const dlg = pa.getByRole("dialog");
  await expect(dlg.getByRole("heading", { name: /Report a hire to/ })).toBeVisible();
  await dlg.getByLabel("Employer, as you know it").fill("Acme <b>Analytics</b>");
  const now = new Date();
  const mm = ymd(now).slice(5, 7);
  await dlg.getByLabel("Year").selectOption(ymd(now).slice(0, 4));
  await dlg.getByLabel("Month").selectOption(mm);
  await dlg.getByLabel("How you learned of it").selectOption("profile");
  await dlg.getByLabel("Type").selectOption("profile_change");
  await dlg.getByLabel("Date of the item").fill(daysAgo(2));
  await dlg.getByLabel("Link (optional)").fill("https://example.com/n3-e2e-secret-link");
  await dlg.getByLabel("Statement").fill(xss);
  await dlg.getByText(/I confirm this report is true/).click();
  await dlg.getByRole("button", { name: "File hire report" }).click();
  await expect(pa.getByText(/Hire report filed\./)).toBeVisible();
  await pa.reload();
  await expect(pa.getByRole("heading", { name: "Hire report" })).toBeVisible();
  await expect(pa.getByText(xss)).toBeVisible();
  await expect(pa.locator('a[href="https://example.com/n3-e2e-secret-link"]')).toHaveCount(1); // A sees its own link
  expect(await xssFired(pa)).toBeNull();
  await expect(pa.getByRole("button", { name: "Report a hire" })).toHaveCount(0); // one pending report per referral

  const pb = await page(browser, b);
  await pb.goto(`/workspace/${orgB.slug}/referrals/${rid}`);
  await expect(pb.getByText(xss)).toBeVisible();
  await expect(pb.locator('a[href*="n3-e2e-secret-link"]')).toHaveCount(0);
  expect(await pb.content()).not.toContain("n3-e2e-secret-link");
  await expect(pb.getByText(/Only .* and Workatent admins can see the links\./)).toBeVisible();
  expect(await xssFired(pb)).toBeNull();
  await expect(pb.getByRole("button", { name: "Report a hire" })).toHaveCount(0);
  await pb.getByRole("button", { name: "Contest" }).click();
  const cdlg = pb.getByRole("dialog");
  await cdlg.getByRole("radio", { name: "Not this client" }).click();
  await expect(cdlg.getByText("Only Workatent admins read this.")).toBeVisible();
  await cdlg.getByLabel("Statement").fill(`The candidate works at a rival of ${CLIENT}, not at our client.`);
  await cdlg.getByText(/I confirm this contest is true/).click();
  await cdlg.getByRole("button", { name: "Contest report" }).click();
  await expect(pb.getByText(/Report contested\./)).toBeVisible();

  await pa.reload();
  await expect(pa.getByText("Not this client").first()).toBeVisible();
  const html = await pa.content();
  expect(html).not.toContain(CLIENT);
  expect(html).not.toContain("rival of");
  await expect(pa.getByRole("button", { name: "Add rebuttal" })).toBeVisible();
  await pa.context().close();
  await pb.context().close();
});

test("B records a hire on a declined referral with the flag off: V4 and the record-only result", async ({ browser }) => {
  const rid = await referral(`N3 Declined ${tag()}`);
  const { data: r } = await admin().from("referrals").select("version").eq("id", rid).single();
  const dec = await b.client.rpc("transition_referral", { p_referral: rid, p_to: "declined" as never, p_reason: "Not the right fit for this role.", p_expected_version: r!.version });
  expect(dec.error).toBeNull();
  const pb = await page(browser, b);
  await pb.goto(`/workspace/${orgB.slug}/referrals/${rid}`);
  await pb.getByRole("button", { name: "Record hire" }).click();
  const dlg = pb.getByRole("dialog");
  await expect(dlg.getByText("No placement will be created")).toBeVisible();
  await expect(dlg.getByLabel(/First-year base salary/)).toHaveCount(0);
  await dlg.getByLabel("Start date").fill(ymd(new Date()));
  await dlg.getByRole("button", { name: "Record hire" }).click();
  // AC-23 / AC-26: the dialog shows the record-only result state (QA-N3-F1 when it doesn't).
  // Round 1 (QA-N3-04 fixed): the result state is rendered by HireResultHost, outside the dialog that re-renders away.
  await expect(pb.getByText("Hire recorded", { exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(pb.getByText(/No placement was created, because the referral had no confirmed agreement/)).toBeVisible();
  await pb.getByRole("button", { name: "Done" }).click();
  await expect(pb.getByText(/No placement was created, because the referral had no confirmed agreement/)).toHaveCount(0);
  // S4-e banner (BR-11) and no second Record hire.
  await expect(pb.getByText("Hire recorded without a split")).toBeVisible();
  // QA-N3-08 (round 1): no split or expected share in the Terms panel after a no-split hire.
  await expect(pb.getByText("Sourcing recruiter's expected share")).toHaveCount(0);
  await expect(pb.getByText(/Sourcing 45% · Hiring 45%/)).toHaveCount(0);
  await expect(pb.getByRole("button", { name: "Record hire" })).toHaveCount(0);
  if (process.env.QA_SHOTS) await pb.screenshot({ path: `${process.env.QA_SHOTS}/v4-after-record.png`, fullPage: true });
  expect(sql(`select kind from public.hire_records where referral_id = '${rid}'`)).toEqual(["record_only_no_agreement"]);
  await pb.context().close();
});

test("admin upholds an unanswered report from the queue; B enters the fee details on the fee-pending placement", async ({ browser }) => {
  sql(`update app.platform_settings set value = 'true'::jsonb where key = 'deemed_agreement_enabled'`);
  const rid = await referral(`N3 Uphold ${tag()}`);
  const filed = await a.client.rpc("file_hire_report", {
    p_referral: rid, p_acting_org: orgA.id, p_employer: "Acme", p_start_month: `${ymd(new Date()).slice(0, 7)}-01`, p_role: "",
    p_learned_via: "candidate", p_statement: "The candidate told me in writing they started.", p_tail_statement: false,
    p_items: [{ type: "candidate_message", item_date: daysAgo(1) }], p_file_ids: [], p_attested: true,
  } as never);
  expect(filed.error).toBeNull();
  const reportId = (filed.data as { report_id: string }).report_id;
  sql(`update app.hire_reports set answer_due_at = now() - interval '1 minute' where id = '${reportId}'`);
  expect((await admin().rpc("run_hire_maintenance")).error).toBeNull();

  const po = await page(browser, ops, /\/(admin|workspace|onboarding)/);
  await po.goto("/admin/hire-reports");
  await expect(po.getByRole("heading", { name: "Hire reports" })).toBeVisible();
  await expect(po.getByText("Unanswered: notice not delivered").first()).toBeVisible();
  await po.goto(`/admin/hire-reports/${reportId}`);
  await expect(po.getByText("No email delivery records (emails start with N7).")).toBeVisible();
  await expect(po.getByText(/Restart|Reopen/)).toHaveCount(0);
  await po.getByRole("button", { name: "Uphold report" }).click();
  const d = po.getByRole("dialog");
  await expect(d.getByText(/A placement is created with fee details pending/)).toBeVisible();
  await expect(d.getByLabel(/fee|salary|amount|currency/i)).toHaveCount(0);
  await d.getByLabel("Written resolution").fill("Upheld on the record: the candidate's message is dated and specific.");
  await d.getByRole("button", { name: "Uphold report" }).click();
  await expect(po.getByText(/Decision saved/)).toBeVisible();
  const pid = sql(`select placement_id from app.hire_reports where id = '${reportId}'`)[0];
  expect(sql(`select status from public.placements where id = '${pid}'`)).toEqual(["fee_pending"]);

  const pb = await page(browser, b);
  await pb.goto(`/workspace/${orgB.slug}/commissions/${pid}`);
  await expect(pb.getByText("Fee details pending from the hiring recruiter").first()).toBeVisible();
  await expect(pb.getByRole("button", { name: /Record client invoice/ })).toHaveCount(0);
  await pb.getByRole("button", { name: "Enter fee details" }).click();
  const fd = pb.getByRole("dialog");
  await fd.getByLabel("Start date").fill(daysAgo(3));
  await fd.getByLabel(/First-year base salary/).fill("100000");
  await fd.getByRole("button", { name: "Save" }).click();
  // AC-70 toast (QA-N3-F1 when the dialog unmounts on revalidation before its success effect runs).
  await expect(pb.getByText("Fee details saved. Next: record the client invoice.")).toBeVisible({ timeout: 5_000 }); // round 1: QA-N3-04 fixed
  await expect.poll(() => sql(`select status from public.placements where id = '${pid}'`)[0]).toBe("hire_reported");
  await po.context().close();
  await pb.context().close();
});

test("AC-101: N3 screens at 375px in en, fr and pt have no horizontal scroll (panel, report dialog, admin queue/detail)", async ({ browser }) => {
  const withPanel = await referral(`N3 Mobile ${tag()} with a long title to wrap`);
  const filed = await a.client.rpc("file_hire_report", {
    p_referral: withPanel, p_acting_org: orgA.id, p_employer: "Acme Analytics International Holdings Incorporated", p_start_month: `${ymd(new Date()).slice(0, 7)}-01`,
    p_role: "Senior principal data platform engineering manager", p_learned_via: "announcement",
    p_statement: "A long statement to check wrapping: https://example.com/a/very/long/path/that/should/wrap/inside/the/panel/without/overflowing",
    p_tail_statement: false, p_items: [{ type: "company_announcement", item_date: daysAgo(3), url: "https://example.com/a/very/long/url/segment/that/must/wrap/for/mobile/layout" }],
    p_file_ids: [], p_attested: true,
  } as never);
  expect(filed.error).toBeNull();
  const reportId = (filed.data as { report_id: string }).report_id;
  sql(`update app.hire_reports set answer_due_at = now() - interval '1 minute' where id = '${reportId}'`);
  await admin().rpc("run_hire_maintenance");
  const fresh = await referral(`N3 Mobile dialog ${tag()}`);
  const overflow = async (p: Page) => {
    await p.waitForLoadState("networkidle");
    return p.evaluate(() => {
      const over = document.scrollingElement!.scrollWidth - window.innerWidth;
      const culprits = [...document.querySelectorAll("main *, [role=dialog] *")]
        .map((el) => ({ el, right: el.getBoundingClientRect().right }))
        .filter((x) => x.right > window.innerWidth + 1)
        .sort((x, y) => y.right - x.right).slice(0, 3)
        .map((x) => `${x.el.tagName.toLowerCase()} "${(x.el.textContent ?? "").trim().slice(0, 40)}" → ${Math.round(x.right)}px`);
      return { over, culprits };
    });
  };
  for (const locale of ["en", "fr", "pt"]) {
    for (const [acct, org, paths, landing] of [
      [a, orgA, [`/workspace/${orgA.slug}/referrals/${withPanel}`, `/workspace/${orgA.slug}/referrals/${fresh}?reportHire=1`], undefined],
      [b, orgB, [`/workspace/${orgB.slug}/referrals/${withPanel}`], undefined],
      [ops, null, ["/admin/hire-reports", `/admin/hire-reports/${reportId}`], /\/(admin|workspace|onboarding)/],
    ] as const) {
      void org;
      const ctx = await browser.newContext({ viewport: { width: 375, height: 900 } });
      const p = await ctx.newPage();
      await signIn(p, acct, landing as RegExp | undefined);
      await ctx.addCookies([{ name: "mh-locale", value: locale, url: test.info().project.use.baseURL ?? "http://localhost:3117" }]);
      for (const [i, path] of (paths as readonly string[]).entries()) {
        await p.goto(path);
        if (path.includes("reportHire=1")) await expect(p.getByRole("dialog")).toBeVisible(); // the modal hides <main> from the a11y tree
        else await expect(p.getByRole("main")).toBeVisible();
        const r = await overflow(p);
        expect.soft(r.over, `${locale} ${acct.name} ${path}: ${r.culprits.join(" | ")}`).toBeLessThanOrEqual(1);
        if (process.env.QA_SHOTS && locale === "fr") await p.screenshot({ path: `${process.env.QA_SHOTS}/375-fr-${acct.name.replace(/\W+/g, "")}-${i}.png`, fullPage: true });
      }
      await ctx.close();
    }
  }
});

test("design B-1 (AC-79): B asks for an authorization check from its contested N1 objection panel, once", async ({ browser }) => {
  const rid = await referral(`N3 AuthCheck ${tag()}`);
  sql(`insert into app.referral_claims (referral_id, source_org_id, target_org_id, filed_by, evidence_kind, prior_process_date, attested_at, contest_deadline_at, status)
       select r.id, r.source_org_id, r.target_org_id, '${b.id}', 'file', current_date - 10, now(), now() + interval '3 days', 'contested' from public.referrals r where r.id = '${rid}'`);
  const pb = await page(browser, b);
  await pb.goto(`/workspace/${orgB.slug}/referrals/${rid}`);
  await pb.getByRole("button", { name: "Ask for an authorization check" }).click();
  const d = pb.getByRole("dialog");
  await d.getByLabel("Why you're asking").fill("QA: the candidate says they never agreed to be presented by this agency.");
  await d.getByRole("button", { name: "Send request" }).click();
  await expect(pb.getByText(/Authorization check requested on/)).toBeVisible();
  await expect(pb.getByRole("button", { name: "Ask for an authorization check" })).toHaveCount(0);
  expect(sql(`select dispute_kind from app.auth_check_requests where referral_id = '${rid}'`)).toEqual(["prior_presentation"]);
  // A never sees B's reason.
  const pa = await page(browser, a);
  await pa.goto(`/workspace/${orgA.slug}/referrals/${rid}`);
  expect(await pa.content()).not.toContain("never agreed to be presented");
  await pa.context().close();
  await pb.context().close();
});
