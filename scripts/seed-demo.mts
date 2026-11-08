/**
 * Seeds ENTIRELY SYNTHETIC demo data for two organizations + a platform admin.
 * Refuses to run when APP_ENV=production. Demo orgs are flagged is_demo=true and labelled in the UI.
 *
 *   npm run db:seed:demo
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/server/db/database.types";
import { assertLocalSupabase } from "../tests/support/assert-local-supabase";

if (process.env.APP_ENV === "production") {
  console.error("Refusing to seed demo data into a production environment.");
  process.exit(1);
}
// Demo accounts share a published password, so a hosted project needs an explicit opt-in.
if (!process.argv.includes("--allow-remote")) {
  try {
    assertLocalSupabase("Demo seed");
  } catch (e) {
    console.error((e as Error).message, "Pass --allow-remote only for a dedicated, non-production demo project.");
    process.exit(1);
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient<Database>(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const PASSWORD = "Demo-password-2026";

async function user(email: string, fullName: string, platformAdmin = false) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let u = list.users.find((x) => x.email === email);
  if (!u) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: fullName } });
    if (error) throw error;
    u = data.user;
  }
  if (platformAdmin) await admin.from("profiles").update({ is_platform_admin: true }).eq("id", u.id);
  const client = createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return { id: u.id, client };
}

async function org(u: Awaited<ReturnType<typeof user>>, name: string, slug: string) {
  const { data: existing } = await admin.from("organizations").select("id").eq("slug", slug).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await u.client.rpc("create_organization", { p_name: name, p_slug: slug });
  if (error) throw error;
  await admin.from("organizations").update({ is_demo: true }).eq("id", data as string);
  return data as string;
}

const candidates = [
  { full_name: "Demo Candidate · Avery Lin", headline: "Senior full-stack engineer (TypeScript)", skills: ["typescript", "react", "node.js", "postgresql", "aws"], seniority: "senior", years_experience: 8, location_city: "Toronto", location_region: "ON", work_arrangements: ["hybrid", "remote"], languages: ["english"] },
  { full_name: "Demo Candidate · Jordan Okafor", headline: "Data engineer, streaming pipelines", skills: ["python", "spark", "airflow", "sql", "aws"], seniority: "mid", years_experience: 4, location_city: "Montréal", location_region: "QC", work_arrangements: ["remote"], languages: ["english", "french"] },
  { full_name: "Demo Candidate · Sam Rivera", headline: "Product designer, B2B SaaS", skills: ["figma", "ux design", "ui design", "design systems"], seniority: "senior", years_experience: 7, location_city: "Vancouver", location_region: "BC", work_arrangements: ["hybrid"], languages: ["english"] },
  { full_name: "Demo Candidate · Priya Nair", headline: "Backend engineer (Go, Kubernetes)", skills: ["go", "kubernetes", "postgresql", "google cloud"], seniority: "senior", years_experience: 6, location_city: "Ottawa", location_region: "ON", work_arrangements: ["remote", "hybrid"], languages: ["english"] },
  { full_name: "Demo Candidate · Taylor Brooks", headline: "Junior frontend developer", skills: ["javascript", "react", "css"], seniority: "junior", years_experience: 1.5, location_city: "Calgary", location_region: "AB", work_arrangements: ["onsite", "hybrid"], languages: ["english"] },
] as const;

const jobs = [
  { title: "Senior Software Engineer, Platform", client_name: "Demo Client · Northwind Health", required_skills: ["typescript", "react", "postgresql"], preferred_skills: ["aws", "graphql"], seniority: "senior", min_years_experience: 5, work_arrangement: "hybrid", location_city: "Toronto", location_region: "ON", salary_min: 14_000_000, salary_max: 17_000_000, expected_fee_minor: 2_000_000 },
  { title: "Data Engineer", client_name: "Demo Client · Maple Logistics", required_skills: ["python", "sql", "airflow"], preferred_skills: ["spark"], seniority: "mid", min_years_experience: 3, work_arrangement: "remote", location_city: null, location_region: null, salary_min: 10_000_000, salary_max: 12_500_000, expected_fee_minor: 1_800_000 },
  { title: "Staff Backend Engineer", client_name: "Demo Client · Aurora Fintech", required_skills: ["go", "kubernetes", "postgresql"], preferred_skills: ["google cloud"], seniority: "lead", min_years_experience: 8, work_arrangement: "remote", location_city: null, location_region: null, salary_min: 18_000_000, salary_max: 21_000_000, expected_fee_minor: 3_000_000 },
] as const;

async function main() {
  const alex = await user("alex@agency-a.demo", "Alex Morgan (demo)");
  const blair = await user("blair@agency-b.demo", "Blair Chen (demo)");
  await user("ops@missionhub.demo", "Platform Ops (demo)", true);

  const orgA = await org(alex, "Demo · Northern Talent Partners", "demo-northern-talent");
  const orgB = await org(blair, "Demo · Lakeshore Search", "demo-lakeshore-search");

  const { count } = await admin.from("candidates").select("id", { count: "exact", head: true }).eq("organization_id", orgA);
  if (!count) {
    for (const c of candidates) {
      const { data, error } = await alex.client
        .from("candidates")
        .insert({ ...c, organization_id: orgA, owner_id: alex.id, created_by: alex.id, location_country: "CA", status: "draft", source: "manual", source_detail: "Synthetic demo record", salary_currency: "CAD" } as never)
        .select("id")
        .single();
      if (error) throw error;
      await alex.client.from("candidate_consents").insert({ organization_id: orgA, candidate_id: data.id, kind: "processing", scope: "Synthetic demo authorization", evidence: "Synthetic demo record — not a real person", recorded_by: alex.id });
      await alex.client.from("candidates").update({ status: "active_for_matching" }).eq("id", data.id);
    }
  }
  const { count: jobCount } = await admin.from("jobs").select("id", { count: "exact", head: true }).eq("organization_id", orgB);
  if (!jobCount) {
    for (const j of jobs) {
      const { error } = await blair.client.from("jobs").insert({
        ...j, organization_id: orgB, owner_id: blair.id, created_by: blair.id, status: "active", accepts_external_referrals: true, client_confidential: true,
        description: "Synthetic demo job. Build reliable products with a small, senior team.", location_country: "CA", languages: ["english"], salary_currency: "CAD", fee_currency: "CAD",
      } as never);
      if (error) throw error;
    }
  }

  // Run matching now so the demo is immediately useful.
  await admin.from("background_jobs").update({ run_at: new Date(Date.now() - 1000).toISOString() }).eq("status", "queued");
  const { drain } = await import("../src/server/queue/worker");
  const processed = await drain();

  console.info(`\nDemo data ready (${processed} background jobs processed).\n`);
  console.info("  Agency A (candidate owner):  alex@agency-a.demo");
  console.info("  Agency B (job owner):        blair@agency-b.demo");
  console.info("  Platform admin:              ops@missionhub.demo");
  console.info(`  Password (all):              ${PASSWORD}\n`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
