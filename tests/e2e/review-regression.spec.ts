import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { admin, createAccount, createCandidate, createJob, createOrg, signIn, waitForMatch } from "./support";

/**
 * QA regression smoke for the design-review round (shared SubmitButton, grid-cols-[minmax(0,1fr)],
 * 44px targets): non-N1 pages that share those components keep working, at desktop and 375px.
 */
test.describe.configure({ mode: "serial" });

/** Soft check, with the widest offending elements in the message so the owner can find them. */
const noHorizontalScroll = async (page: Page) => {
  await page.waitForLoadState("networkidle");
  const r = await page.evaluate(() => {
    const over = document.scrollingElement!.scrollWidth - window.innerWidth;
    const culprits = [...document.querySelectorAll("body *")]
      .map((el) => ({ el, right: el.getBoundingClientRect().right }))
      .filter((x) => x.right > window.innerWidth + 1)
      .sort((x, y) => y.right - x.right)
      .slice(0, 3)
      .map((x) => `${x.el.tagName.toLowerCase()}.${String((x.el as HTMLElement).className).slice(0, 80)} → ${Math.round(x.right)}px`);
    return { over, culprits };
  });
  expect.soft(r.over, `${page.url()} overflows: ${r.culprits.join(" | ")}`).toBeLessThanOrEqual(1);
};

test("job form: publish once (double click), save draft, edit and save; no horizontal scroll at 375px", async ({ page }) => {
  const acct = await createAccount("Smoke Owner");
  const org = await createOrg(acct, "Smoke Hiring");
  await signIn(page, acct);
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/workspace/${org.slug}/jobs/new`);
    await expect(page.getByLabel("Job title")).toBeVisible();
    await noHorizontalScroll(page);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  const title = `Smoke role ${randomUUID().slice(0, 6)}`;
  await page.goto(`/workspace/${org.slug}/jobs/new`);
  await page.getByLabel("Job title").fill(title);
  await page.getByLabel(/Hiring client/).fill("Northwind Health"); // N3 BR-1
  await page.getByRole("checkbox", { name: /Hide the client/ }).check();
  await page.locator("#requiredSkills").fill("typescript, react");
  await page.locator("#description").fill("Build clinical scheduling tools for hospitals.");
  // N2 (BR-6): the job opens to partners by default, so publishing needs a complete card: a rate and the T6 attestation.
  await page.locator("#feeRate").fill("20");
  await page.getByRole("checkbox", { name: /We hold the fee agreement directly with the end client/ }).check();
  await page.getByRole("button", { name: "Publish job" }).dblclick();
  await expect(page).not.toHaveURL(/\/jobs\/new$/, { timeout: 20_000 });
  await expect.poll(async () => (await admin().from("jobs").select("id, status").eq("organization_id", org.id).eq("title", title)).data!.length).toBe(1);
  const job = (await admin().from("jobs").select("id, status").eq("organization_id", org.id).eq("title", title).single()).data!;
  expect(job.status).toBe("active");

  // N2: a single published card (AC-8), and a non-terms edit saves without re-attesting and publishes nothing.
  expect((await admin().from("job_terms_versions").select("id").eq("job_id", job.id)).data).toHaveLength(1);
  await page.goto(`/workspace/${org.slug}/jobs/${job.id}/edit`);
  await page.getByLabel("Job title").fill(`${title} (edited)`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(async () => (await admin().from("jobs").select("title").eq("id", job.id).single()).data!.title).toBe(`${title} (edited)`);
  expect((await admin().from("job_terms_versions").select("id").eq("job_id", job.id)).data).toHaveLength(1);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(`/workspace/${org.slug}/jobs/${job.id}/edit`);
  await noHorizontalScroll(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  const draft = `Smoke draft ${randomUUID().slice(0, 6)}`;
  await page.goto(`/workspace/${org.slug}/jobs/new`);
  await page.getByLabel("Job title").fill(draft);
  await page.getByLabel(/Hiring client/).fill("Northwind Health"); // N3 BR-1
  await page.getByRole("checkbox", { name: /Hide the client/ }).check();
  // N2 (BR-6, AC-10): a draft open to partners still needs the card; the save is refused and nothing is created.
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByText("Complete the terms for partners to open this job to partner referrals.").first()).toBeVisible();
  expect((await admin().from("jobs").select("id").eq("organization_id", org.id).eq("title", draft)).data).toHaveLength(0);
  // A private draft needs no card.
  await page.getByRole("checkbox", { name: "Open this job to partner recruiters" }).uncheck();
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect.poll(async () => (await admin().from("jobs").select("status").eq("organization_id", org.id).eq("title", draft).maybeSingle()).data?.status, { timeout: 20_000 }).toBe("draft");
  await page.goto(`/workspace/${org.slug}/jobs`);
  await expect(page.getByText(`${title} (edited)`).first()).toBeVisible();
});

test("composer and admin overview: no horizontal scroll at 375px; admin panels render", async ({ browser }) => {
  const a = await createAccount("Smoke Sourcer");
  const b = await createAccount("Smoke Partner");
  const ops = await createAccount("Smoke Ops", { platformAdmin: true });
  const orgA = await createOrg(a, "Smoke Sourcing");
  const orgB = await createOrg(b, "Smoke Partner Co");
  const cand = await createCandidate(a, orgA.id, "Smoke Candidate-E2E");
  const job = await createJob(b, orgB.id, `Smoke match ${randomUUID().slice(0, 6)}`);
  await waitForMatch(cand, job);
  const mId = (await admin().from("matches").select("id").eq("candidate_id", cand).eq("job_id", job).single()).data!.id;

  const ctx = await browser.newContext({ viewport: { width: 375, height: 900 } });
  const page = await ctx.newPage();
  await signIn(page, a);
  await page.goto(`/workspace/${orgA.slug}/opportunities/${mId}`);
  await expect(page.getByRole("button", { name: "Submit candidate" })).toBeVisible();
  await noHorizontalScroll(page);
  await ctx.close();

  const actx = await browser.newContext();
  const ap = await actx.newPage();
  await signIn(ap, ops, /^((?!sign-in).)*$/);
  for (const width of [1280, 375]) {
    await ap.setViewportSize({ width, height: 900 });
    await ap.goto("/admin");
    await expect(ap.getByText("Duplicate protection").first()).toBeVisible();
    await expect(ap.getByText("Organizations to review").first()).toBeVisible();
    await noHorizontalScroll(ap);
    await ap.goto("/admin/disputes");
    await expect(ap.getByRole("heading", { level: 1 })).toBeVisible();
    await noHorizontalScroll(ap);
  }
  await actx.close();
});
