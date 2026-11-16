import { expect, test } from "@playwright/test";
import { admin, createAccount, createOrg, signIn } from "./support";

const shots = process.env.E2E_SHOTS_DIR;
const snap = async (page: import("@playwright/test").Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};

// Steps: organization → profile → Network Rules → review. The Rules step itself (locale switch,
// stored locale) is covered in network-rules-qa.spec.ts; here it is only passed through.
test("new users set up a workspace through the step-by-step onboarding", async ({ page }) => {
  const taken = await createAccount("Taken Slug Owner");
  const takenOrg = await createOrg(taken, "Taken Workspace");
  const user = await createAccount("Sam Rivera", { acceptRules: false });
  await signIn(page, user, /\/onboarding/);
  const cont = page.getByRole("button", { name: "Continue" });

  // Step 1: organization, client-side validation first
  await expect(page.getByRole("heading", { name: "Welcome, Sam! Set up your organization" })).toBeVisible();
  await cont.click();
  await expect(page.getByText("Enter your organization name")).toBeVisible();
  const name = `Rivera Talent ${Date.now().toString(36)}`;
  await page.getByLabel("Organization name").fill(name);
  await expect(page.getByLabel("Workspace URL")).toHaveValue(/^rivera-talent-/);
  await page.getByLabel("Workspace URL").fill(takenOrg.slug); // will be rejected by the server
  await page.getByLabel("Default currency").selectOption("USD");
  await snap(page, "1-organization");
  await cont.click();

  // Step 2: profile with chips
  await expect(page.getByRole("heading", { name: "Your recruiter profile" })).toBeFocused();
  await page.getByLabel("Headline").fill("Data recruiter for US and Canadian startups");
  await page.getByRole("button", { name: "Data & AI" }).click();
  await page.getByLabel("Regions you recruit in").fill("Nova Scotia");
  await page.getByLabel("Regions you recruit in").press("Enter");
  await expect(page.getByRole("button", { name: "Remove Nova Scotia" })).toBeVisible();
  await snap(page, "2-profile");
  await page.setViewportSize({ width: 390, height: 844 });
  await snap(page, "2-profile-mobile");
  await page.setViewportSize({ width: 1280, height: 720 });
  await cont.click();

  // Step 3: Network Rules, both statements
  await expect(page.getByRole("heading", { name: "Accept the Network Rules" })).toBeFocused();
  const boxes = page.getByRole("checkbox");
  await expect(boxes).toHaveCount(2);
  await expect(cont).toBeDisabled();
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await cont.click();

  // Step 4: review → server rejects the taken URL and returns to step 1 with data intact
  await expect(page.getByRole("heading", { name: "Ready to go?" })).toBeFocused();
  await expect(page.getByText(name)).toBeVisible();
  await expect(page.getByText("Data & AI · Nova Scotia")).toBeVisible();
  await snap(page, "4-review");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByText(/workspace URL is taken/)).toBeVisible();
  await expect(page.getByLabel("Organization name")).toHaveValue(name);

  const slug = `rivera-${Date.now().toString(36)}`;
  await page.getByLabel("Workspace URL").fill(slug);
  await cont.click();
  await expect(page.getByLabel("Headline")).toHaveValue(/Data recruiter/);
  await cont.click();
  // The acceptance is kept for the same version: the boxes stay ticked.
  await expect(boxes.nth(0)).toBeChecked();
  await expect(boxes.nth(1)).toBeChecked();
  await cont.click();
  await page.getByRole("button", { name: "Create organization" }).click();
  await page.waitForURL(`**/workspace/${slug}/overview`);

  const db = admin();
  const { data: org } = await db.from("organizations").select("id, kind, default_currency, name").eq("slug", slug).single();
  expect(org).toMatchObject({ kind: "agency", default_currency: "USD", name });
  const { data: profile } = await db.from("profiles").select("headline, specialties, regions").eq("id", user.id).single();
  expect(profile).toEqual({ headline: "Data recruiter for US and Canadian startups", specialties: ["Data & AI"], regions: ["Nova Scotia"] });
  const { data: oa } = await db.from("network_rules_org_acceptances").select("accepted_by").eq("organization_id", org!.id);
  expect(oa).toEqual([{ accepted_by: user.id }]);
});
