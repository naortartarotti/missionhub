import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { admin, createAccount, createOrg, signIn, type Account } from "./support";

/**
 * N10 QA: unhappy paths through the UI (local stack only). Settlement mode (AC-98, AC-99, AC-105),
 * a non-admin on Network standing (AC-47, AC-75), the versions page for signed-out / gated users and
 * a French-first org (AC-10, AC-12, AC-33), and the `?next=` guard on the accept page (AC-117 / H).
 * `test.fail` marks a reproduced bug (QA-N10-xx in qa-report.md).
 */
test.describe.configure({ mode: "serial" });

let ops: Account, heldAdmin: Account, heldRec: Account, settler: Account, gated: Account;
let held: { id: string; slug: string; name: string }, settling: { id: string; slug: string; name: string };

test.beforeAll(async () => {
  const tag = randomUUID().slice(0, 6);
  ops = await createAccount("QA10 Ops", { platformAdmin: true });
  heldAdmin = await createAccount("QA10 Held Admin");
  heldRec = await createAccount("QA10 Held Recruiter");
  settler = await createAccount("QA10 Settler");
  gated = await createAccount("QA10 Gated", { acceptRules: false });
  held = await createOrg(heldAdmin, `QA Held ${tag}`);
  settling = await createOrg(settler, `QA Settling ${tag}`);
  const db = admin();
  for (const [org, u, role] of [[held.id, heldRec.id, "recruiter"], [held.id, gated.id, "recruiter"]] as const) {
    const { error } = await db.from("organization_memberships").insert({ organization_id: org, user_id: u, role, status: "active" });
    if (error) throw error;
  }
  // Immediate hold on `held` through the RPC (admin case + hold), as the integration fixtures do.
  const { data: caseId, error: cErr } = await ops.client.rpc("admin_open_conduct_case", {
    p_org: held.id, p_category: "shared_outside", p_admin_source: "other", p_referral: null as unknown as string,
    p_description: "QA admin-initiated case for the N10 E2E suite.", p_file_ids: [],
  });
  if (cErr) throw cErr;
  const { data: v } = await db.from("network_rules_versions").select("id").eq("status", "published").order("effective_at", { ascending: false }).limit(1).single();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const { error: hErr } = await ops.client.rpc("admin_apply_immediate_hold", {
    p_case: caseId as string, p_ground: "2.3", p_language: "en", p_conduct_date: today, p_rules_version: v!.id, p_rules_cited: [],
    p_allegation: "Shared a partner's candidate profile outside the network.", p_alleged_when: "This month",
    p_evidence_summary: "An email from an outside agency forwarding the profile.", p_name_reporter: false,
  });
  if (hErr) throw hErr;
  // A suspended org (settlement mode). Legacy-style suspension: suspended_at only.
  const { error: sErr } = await db.from("organizations").update({ suspended_at: new Date().toISOString() }).eq("id", settling.id);
  if (sErr) throw sErr;
});

test.afterAll(async () => {
  await admin().from("organizations").update({ suspended_at: null }).eq("id", settling.id);
});

test("held org: a recruiter sees B2 without the standing link, and /settings/standing is not found (AC-47, AC-75)", async ({ page }) => {
  await signIn(page, heldRec);
  await expect(page.getByText("Your organization is on a network hold")).toBeVisible();
  await expect(page.getByRole("link", { name: "View network standing" })).toHaveCount(0);
  await page.goto(`/workspace/${held.slug}/settings/standing`);
  await expect(page.getByText("Immediate network hold under rule 9.4")).toHaveCount(0);
  await expect(page.getByText(/not found|couldn.t find|doesn.t exist/i).first()).toBeVisible();
});

test("held org: the opportunities page shows the paused state, not partner jobs (AC-42)", async ({ page }) => {
  await signIn(page, heldAdmin);
  await page.goto(`/workspace/${held.slug}/opportunities`);
  await expect(page.getByText("Partner opportunities are paused")).toBeVisible();
});

test("settlement mode: switcher pill, B6, settlement home, and a blocked route renders the settlement page (AC-98, AC-99, AC-105)", async ({ page }) => {
  await signIn(page, settler);
  await expect(page.getByText("Your organization is suspended")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Settlement mode" })).toBeVisible();
  await page.goto(`/workspace/${settling.slug}/candidates`);
  await expect(page.getByText("This page isn’t available in settlement mode")).toBeVisible();
  // Candidates / Jobs / Opportunities are absent from the nav.
  const nav = page.getByRole("navigation").first();
  for (const name of ["Candidates", "Jobs", "Opportunities"]) await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(0);
});

test("versions page: signed-out visitors go to sign-in; a gated member can read it (AC-10)", async ({ page }) => {
  await page.goto("/network-rules");
  await expect(page).toHaveURL(/\/sign-in/);
  await signIn(page, gated, /\/workspace\//);
  await page.goto(`/network-rules?org=${held.slug}`);
  await expect(page.getByText("Current version: 1.0")).toBeVisible();
  await expect(page.getByText("You haven’t accepted version 1.0 yet.")).toBeVisible();
});

test("versions page: a French org opens the rules in fr-CA first (AC-12, AC-33)", async ({ page }) => {
  await admin().from("organizations").update({ locale: "fr-CA" }).eq("id", held.id);
  try {
    await signIn(page, heldAdmin);
    await page.goto(`/network-rules?org=${held.slug}`);
    await expect(page.locator('[lang="fr-CA"]:visible').first()).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Language of the rules" }).getByRole("link").first()).toHaveText("Français");
    await expect(page.getByRole("link", { name: "1. Adhésion et acceptation" }).first()).toBeAttached();
  } finally {
    await admin().from("organizations").update({ locale: "en" }).eq("id", held.id);
  }
});

// QA-N10-04 (MAJOR, frontend): `?next=/%09/evil.example` passes safeNext and the browser resolves the
// link to https://evil.example (tab stripped). Expected: the Back link stays on the app origin.
test("QA-N10-04: the accept page's Back link never leaves the app origin", async ({ page, baseURL }) => {
  await signIn(page, heldAdmin);
  await page.goto(`/workspace/${held.slug}/accept-rules?next=%2F%09%2Fevil.example%2Fphish`);
  const back = page.getByRole("link", { name: "Back" }).first();
  await expect(back).toBeVisible();
  const resolved = await back.evaluate((a) => (a as HTMLAnchorElement).href);
  expect(new URL(resolved).origin).toBe(new URL(baseURL!).origin);
});

test("onboarding Rules step: two unticked boxes, language switch unticks, acceptances stored with the shown locale (AC-14, AC-15, AC-17)", async ({ page }) => {
  const user = await createAccount("QA10 Founder", { acceptRules: false }); // a brand-new user: no acceptance yet
  await signIn(page, user, /\/onboarding/);
  const slug = `qa10-onb-${randomUUID().slice(0, 6)}`;
  await page.getByLabel("Organization name").fill(`QA10 Onboarding ${slug}`);
  await page.getByLabel("Workspace URL").fill(slug);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 2 of 4", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 3 of 4", { exact: false })).toBeVisible();
  const boxes = page.getByRole("checkbox");
  await expect(boxes).toHaveCount(2);
  await expect(boxes.nth(0)).not.toBeChecked();
  await expect(boxes.nth(1)).not.toBeChecked();
  const cont = page.getByRole("button", { name: "Continue" });
  await expect(cont).toBeDisabled();
  await expect(page.getByText("Tick both boxes to continue.")).toBeVisible();
  await boxes.nth(0).check();
  await expect(cont).toBeDisabled();
  await boxes.nth(1).check();
  await expect(cont).toBeEnabled();
  // Switching the language unticks both and says so (AC-17).
  await page.getByRole("button", { name: "Français" }).click();
  await expect(boxes.nth(0)).not.toBeChecked();
  await expect(boxes.nth(1)).not.toBeChecked();
  await expect(page.getByText("The language changed. Tick the boxes again.")).toBeVisible();
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await cont.click();
  await page.getByRole("button", { name: /Create organization/ }).click();
  await page.waitForURL(`**/workspace/${slug}/overview`);
  const db = admin();
  const { data: org } = await db.from("organizations").select("id").eq("slug", slug).single();
  const { data: oa } = await db.from("network_rules_org_acceptances").select("locale, accepted_by").eq("organization_id", org!.id);
  const { data: ma } = await db.from("network_rules_member_acceptances").select("locale").eq("user_id", user.id);
  expect(oa).toEqual([{ locale: "fr-CA", accepted_by: user.id }]);
  expect(ma).toEqual([{ locale: "fr-CA" }]);
});

test("round 2: admin pages read the sanction columns through admin_organizations (QA-N10-01 fix)", async ({ page }) => {
  await signIn(page, ops, /\/(workspace|onboarding|admin)/);
  await page.goto("/admin");
  await expect(page.getByRole("heading").first()).toBeVisible();
  await page.goto(`/admin/organizations?status=suspended&q=${encodeURIComponent(settling.name)}`);
  const row = page.getByRole("row", { name: new RegExp(settling.name) });
  await expect(row).toBeVisible();
  await expect(row.getByText("Suspended", { exact: true })).toBeVisible();
  await page.goto(`/admin/organizations/${settling.id}`);
  await expect(page.getByRole("heading", { name: settling.name })).toBeVisible();
  await expect(page.getByText("Suspended (before N10)").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Lift/ }).first()).toBeVisible();
  // The held org shows its hold (not a suspension).
  await page.goto(`/admin/organizations/${held.id}`);
  await expect(page.getByRole("heading", { name: held.name })).toBeVisible();
});
