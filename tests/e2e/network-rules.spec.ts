import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { admin, createAccount, createCandidate, createJob, createOrg, signIn, termsOf, type Account } from "./support";

/**
 * N10 (docs/specs/network-rules-enforcement) main journeys through the UI: the first-access gate
 * (BR-7, AC-17/18), filing a conduct report from a referral (S7/S8, S9) and a platform admin applying
 * an immediate network hold (S16) that the held org then sees (B2). Local stack only; needs the app
 * running (the report itself has no files, so the evidence worker isn't needed).
 */
test.describe.configure({ mode: "serial" });

let owner: Account, partner: Account, newcomer: Account, ops: Account;
let orgA: { id: string; slug: string; name: string }, orgB: { id: string; slug: string; name: string };
let referralId: string;

test.beforeAll(async () => {
  const tag = randomUUID().slice(0, 6);
  owner = await createAccount("N10 Owner");
  partner = await createAccount("N10 Partner");
  newcomer = await createAccount("N10 Newcomer", { acceptRules: false });
  ops = await createAccount("N10 Ops", { platformAdmin: true });
  orgA = await createOrg(owner, `Sourcing ${tag}`);
  orgB = await createOrg(partner, `Hiring ${tag}`);
  // An invited member who never accepted any version (the gate starts once the membership exists).
  const { error } = await admin().from("organization_memberships").insert({ organization_id: orgA.id, user_id: newcomer.id, role: "recruiter", status: "active" });
  if (error) throw error;

  // A referral from A to B's job (recorded-authorization path), as the integration fixtures do.
  const jobId = await createJob(partner, orgB.id, `N10 role ${tag}`);
  const candidateId = await createCandidate(owner, orgA.id, `N10 Candidate ${tag}`);
  const { data: consent, error: cErr } = await owner.client
    .from("candidate_consents")
    .insert({ organization_id: orgA.id, candidate_id: candidateId, kind: "job_sharing", job_id: jobId, scope: "Share with partner for this role", evidence: "Synthetic E2E consent", recorded_by: owner.id })
    .select("id")
    .single();
  if (cErr) throw cErr;
  const { data, error: sErr } = await owner.client
    .rpc("submit_referral", {
      p_candidate: candidateId, p_job: jobId, p_terms_version: await termsOf(jobId), p_fields: ["headline", "skills"],
      p_document_ids: [], p_consent: consent.id, p_idempotency_key: randomUUID(), p_acknowledge_pending: false,
    } as never)
    .single();
  if (sErr) throw sErr;
  const out = data as { outcome: string; referral_id: string | null };
  if (out.outcome !== "created" || !out.referral_id) throw new Error(`referral not created: ${out.outcome}`);
  referralId = out.referral_id;
});

test("first access: the gate replaces the workspace until the member accepts (BR-7)", async ({ page }) => {
  await signIn(page, newcomer);
  await expect(page.getByText("Before you use MissionHub, read and accept the Network Rules.")).toBeVisible();
  // No workspace navigation behind the gate; the version history link stays.
  await expect(page.getByRole("navigation", { name: /main/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Version history" }).first()).toBeVisible();
  const accept = page.getByRole("button", { name: "Accept and continue" });
  await expect(accept).toBeDisabled();
  await expect(page.getByText("Tick the box to continue.")).toBeVisible();
  // A recruiter sees the personal statement only.
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  await page.getByRole("checkbox", { name: /accept them personally/ }).check();
  await expect(accept).toBeEnabled();
  await accept.click();
  await expect(page.getByText("Network Rules accepted.")).toBeVisible();
  await expect(page.getByText("Before you use MissionHub, read and accept the Network Rules.")).toHaveCount(0);
  const { data } = await admin().from("network_rules_member_acceptances").select("locale").eq("user_id", newcomer.id);
  expect(data?.length).toBe(1);
});

test("report a problem from a referral, then follow it (S7, S8, S9)", async ({ page }) => {
  await signIn(page, owner);
  await page.goto(`/workspace/${orgA.slug}/referrals/${referralId}`);
  await page.getByRole("button", { name: `Report a problem with ${orgB.name}` }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: `Report a problem with ${orgB.name}` })).toBeVisible();
  // Sourcing side: all 9 categories.
  await expect(dialog.getByRole("radio")).toHaveCount(9);
  // Validation runs on submit: category and attestation are required.
  await dialog.getByRole("button", { name: "Send report" }).click();
  await expect(dialog.getByText("Choose what the problem is.")).toBeVisible();
  await dialog.getByRole("radio", { name: /Something else/ }).check();
  await dialog.getByLabel("What happened?").fill("They contacted my candidate directly about another role after the referral.");
  await dialog.getByRole("checkbox", { name: /in good faith/ }).check();
  await dialog.getByRole("button", { name: "Send report" }).click();
  await expect(dialog.getByRole("heading", { name: "Report sent" })).toBeVisible();
  await dialog.getByRole("link", { name: "View your report" }).click();
  await expect(page).toHaveURL(new RegExp(`/workspace/${orgA.slug}/reports/`));
  await expect(page.getByText("Received", { exact: true })).toBeVisible();
  await expect(page.getByText("They contacted my candidate directly")).toBeVisible();
  // Back on the referral, the reporter sees the muted line.
  await page.goto(`/workspace/${orgA.slug}/referrals/${referralId}`);
  await expect(page.getByText(/You reported a problem on/)).toBeVisible();
});

test("platform admin applies an immediate hold; the held org sees the banner (S16, B2)", async ({ page, browser }) => {
  const { data: cases, error } = await ops.client.rpc("admin_list_conduct_cases", { p_open_only: true });
  if (error) throw error;
  const theCase = (cases as { id: string; reported_org: { id: string } }[]).find((c) => c.reported_org.id === orgB.id);
  expect(theCase, "the report from the previous test is in the admin queue").toBeTruthy();

  await signIn(page, ops, /\/(workspace|onboarding|admin)/);
  await page.goto("/admin/disputes?filter=conduct");
  await expect(page.getByText(`${orgB.name} · reported by ${orgA.name}`)).toBeVisible();
  await page.goto(`/admin/disputes/conduct/${theCase!.id}`);
  await page.getByRole("button", { name: "Apply immediate hold" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /Rule 2\.3/ }).check();
  await dialog.getByRole("textbox", { name: "What is alleged" }).fill("The organization sent a partner's candidate profile to another agency outside the network.");
  await dialog.getByRole("textbox", { name: "When", exact: true }).fill("Between Nov 2 and Nov 9, 2026");
  await dialog.getByRole("textbox", { name: "Evidence summary" }).fill("An email from the other agency forwarding the shared profile, dated Nov 9, 2026.");
  await dialog.getByRole("button", { name: "Next" }).click();
  await expect(dialog.getByText("Apply the hold and send the notice now?")).toBeVisible();
  await dialog.getByRole("button", { name: "Apply hold and send notice" }).click();
  await expect(page.getByText(`Hold applied. Notice sent to ${orgB.name}.`)).toBeVisible();

  const ctx = await browser.newContext();
  const partnerPage = await ctx.newPage();
  await signIn(partnerPage, partner);
  await expect(partnerPage.getByText("Your organization is on a network hold")).toBeVisible();
  await partnerPage.goto(`/workspace/${orgB.slug}/settings/standing`);
  await expect(partnerPage.getByText("Immediate network hold under rule 9.4").first()).toBeVisible();
  await ctx.close();
});
