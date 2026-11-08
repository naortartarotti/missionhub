import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
import { assertLocalSupabase } from "./tests/support/assert-local-supabase";

config({ path: ".env.local" });
assertLocalSupabase("E2E tests");

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Locally this reuses an already-running `npm run dev` (web + worker); in CI it starts one.
  webServer: {
    command: process.env.CI ? "npm run build && npx concurrently -k \"npm start\" \"npm:worker\"" : "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
