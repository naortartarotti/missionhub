import { expect, test } from "@playwright/test";

test("protected workspace routes redirect to sign-in", async ({ page }) => {
  await page.goto("/workspace/anything/overview");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("failed sign-in shows an error and keeps what the user typed", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill("nobody@test.missionhub.local");
  await page.getByLabel("Password").fill("Wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  // Regression: React 19 form actions reset uncontrolled inputs after submit.
  await expect(page.getByLabel("Work email")).toHaveValue("nobody@test.missionhub.local");
});
