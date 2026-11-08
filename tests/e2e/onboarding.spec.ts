import { expect, test } from "@playwright/test";
import { admin, createAccount, createOrg, signIn } from "./support";

const shots = process.env.E2E_SHOTS_DIR;
const snap = async (page: import("@playwright/test").Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};

test("new users set up a workspace through the step-by-step onboarding", async ({ page }) => {
  const taken = await createAccount("Taken Slug Owner");
  const takenOrg = await createOrg(taken, "Taken Workspace");
  const user = await createAccount("Sam Rivera");
  await signIn(page, user, /\/onboarding/);

  // Step 1: organization type
  await expect(page.getByRole("heading", { name: /Welcome, Sam! How do you work\?/ })).toBeVisible();
  await snap(page, "1-kind");
  await page.getByRole("radio", { name: /Independent/ }).click();
  await expect(page.getByRole("radio", { name: /Independent/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: workspace, client-side validation first
  await expect(page.getByRole("heading", { name: "Name your workspace" })).toBeFocused();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter your organization name")).toBeVisible();
  const name = `Rivera Talent ${Date.now().toString(36)}`;
  await page.getByLabel("Business or display name").fill(name);
  await expect(page.getByLabel("Workspace URL")).toHaveValue(/^rivera-talent-/);
  await page.getByLabel("Workspace URL").fill(takenOrg.slug); // will be rejected by the server
  await page.getByLabel("Default currency").selectOption("USD");
  await snap(page, "2-workspace");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3: profile with chips
  await page.getByLabel("Headline").fill("Data recruiter for US and Canadian startups");
  await page.getByRole("button", { name: "Data & AI" }).click();
  await page.getByLabel("Regions you recruit in").fill("Nova Scotia");
  await page.getByLabel("Regions you recruit in").press("Enter");
  await expect(page.getByRole("button", { name: "Remove Nova Scotia" })).toBeVisible();
  await snap(page, "3-profile");
  await page.setViewportSize({ width: 390, height: 844 });
  await snap(page, "3-profile-mobile");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 4: review → server rejects the taken URL and returns to step 2 with data intact
  await expect(page.getByText("Independent recruiter")).toBeVisible();
  await expect(page.getByText("Data & AI · Nova Scotia")).toBeVisible();
  await snap(page, "4-review");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByText(/workspace URL is taken/)).toBeVisible();
  await expect(page.getByLabel("Business or display name")).toHaveValue(name);
  await snap(page, "2b-taken");

  const slug = `rivera-${Date.now().toString(36)}`;
  await page.getByLabel("Workspace URL").fill(slug);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("Headline")).toHaveValue(/Data recruiter/);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.waitForURL(`**/w/${slug}/overview`);

  const db = admin();
  const { data: org } = await db.from("organizations").select("kind, default_currency, name").eq("slug", slug).single();
  expect(org).toEqual({ kind: "independent", default_currency: "USD", name });
  const { data: profile } = await db.from("profiles").select("headline, specialties, regions").eq("id", user.id).single();
  expect(profile).toEqual({ headline: "Data recruiter for US and Canadian startups", specialties: ["Data & AI"], regions: ["Nova Scotia"] });
});
