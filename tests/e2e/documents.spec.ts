import { expect, test } from "@playwright/test";
import { createAccount, createCandidate, createOrg, signIn } from "./support";

/** A synthetic PDF of the given size (valid header so the scanner accepts it). */
const pdf = (bytes: number) => {
  const head = Buffer.from("%PDF-1.4\n% synthetic e2e resume\n");
  const tail = Buffer.from("\n%%EOF\n");
  return Buffer.concat([head, Buffer.alloc(bytes - head.length - tail.length, 0x20), tail]);
};

test("resume uploads up to 10 MB work and larger files are refused", async ({ page }) => {
  const acct = await createAccount("Uploader");
  const org = await createOrg(acct, "Upload Co");
  const candidateId = await createCandidate(acct, org.id, "Robin Upload-E2E");
  await signIn(page, acct);
  await page.goto(`/w/${org.slug}/candidates/${candidateId}`);

  // Regression: Server Actions default to a 1 MB body limit.
  await page.getByLabel(/Upload resume/).setInputFiles({ name: "resume-3mb.pdf", mimeType: "application/pdf", buffer: pdf(3 * 1024 * 1024) });
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByText("resume-3mb.pdf")).toBeVisible();

  await page.getByLabel(/Upload resume/).setInputFiles({ name: "too-big.pdf", mimeType: "application/pdf", buffer: pdf(10 * 1024 * 1024 + 1024) });
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByText("Files must be 10 MB or smaller.")).toBeVisible();
});
