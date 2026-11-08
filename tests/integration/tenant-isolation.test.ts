import { beforeAll, describe, expect, it } from "vitest";
import { admin, createCandidate, createJob, createOrg, createUser, type TestUser } from "./helpers";

let a: TestUser, b: TestUser, c: TestUser;
let orgA: { id: string }, orgB: { id: string };
let candidateA: string, jobB: string;

beforeAll(async () => {
  [a, b, c] = await Promise.all([createUser("alice"), createUser("bob"), createUser("carol")]);
  orgA = await createOrg(a, "Agency A");
  orgB = await createOrg(b, "Agency B");
  await createOrg(c, "Agency C");
  candidateA = await createCandidate(a, orgA.id);
  jobB = await createJob(b, orgB.id);
});

describe("tenant isolation (RLS)", () => {
  it("lists only the caller's own organization's candidates", async () => {
    const { data: mine } = await a.client.from("candidates").select("id");
    expect(mine?.map((r) => r.id)).toContain(candidateA);
    const { data: theirs } = await b.client.from("candidates").select("id");
    expect(theirs?.map((r) => r.id)).not.toContain(candidateA);
  });

  it("blocks IDOR reads of another tenant's candidate by id", async () => {
    const { data, error } = await b.client.from("candidates").select("*").eq("id", candidateA).maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("blocks updates to another tenant's candidate", async () => {
    const { data } = await b.client.from("candidates").update({ full_name: "pwned" }).eq("id", candidateA).select();
    expect(data ?? []).toHaveLength(0);
    const { data: check } = await admin().from("candidates").select("full_name").eq("id", candidateA).single();
    expect(check?.full_name).toBe("Avery Test");
  });

  it("blocks inserting rows into another tenant", async () => {
    const { error } = await b.client.from("candidates").insert({
      organization_id: orgA.id, owner_id: b.id, created_by: b.id, full_name: "Injected",
    });
    expect(error).not.toBeNull();
  });

  it("forbids moving a record to another organization", async () => {
    const { error } = await a.client.from("candidates").update({ organization_id: orgB.id }).eq("id", candidateA);
    expect(error).not.toBeNull();
  });

  it("hides other tenants' jobs, consents and memberships", async () => {
    const { data: jobs } = await a.client.from("jobs").select("id").eq("id", jobB);
    expect(jobs).toHaveLength(0);
    const { data: consents } = await b.client.from("candidate_consents").select("id").eq("candidate_id", candidateA);
    expect(consents).toHaveLength(0);
    const { data: members } = await c.client.from("organization_memberships").select("organization_id").eq("organization_id", orgA.id);
    expect(members).toHaveLength(0);
  });

  it("never exposes the raw matches table or the job queue to users", async () => {
    const m = await a.client.from("matches").select("*");
    expect(m.data ?? []).toHaveLength(0);
    const q = await a.client.from("background_jobs").select("*");
    expect(q.data ?? []).toHaveLength(0);
    const claim = await a.client.rpc("claim_background_jobs", { p_worker: "evil", p_limit: 10 });
    expect(claim.error).not.toBeNull();
  });

  it("rejects projection calls for organizations the user does not belong to", async () => {
    const { error } = await b.client.rpc("get_opportunities", { p_org: orgA.id });
    expect(error?.message).toMatch(/forbidden/);
    const { error: e2 } = await a.client.rpc("get_job_match_summary", { p_job: jobB });
    expect(e2?.message).toMatch(/forbidden/);
  });

  it("prevents self-promotion to platform admin", async () => {
    const { error } = await a.client.from("profiles").update({ is_platform_admin: true }).eq("id", a.id);
    expect(error).not.toBeNull();
  });

  it("blocks storage access to another tenant's document paths", async () => {
    const path = `${orgA.id}/${candidateA}/resume.pdf`;
    const up = await a.client.storage.from("candidate-documents").upload(path, new Blob(["%PDF-1.4 test"], { type: "application/pdf" }), {
      contentType: "application/pdf",
    });
    expect(up.error).toBeNull();
    const dl = await b.client.storage.from("candidate-documents").download(path);
    expect(dl.error).not.toBeNull();
    const signed = await b.client.storage.from("candidate-documents").createSignedUrl(path, 60);
    expect(signed.error).not.toBeNull();
    const forged = await b.client.storage.from("candidate-documents").upload(`${orgA.id}/${candidateA}/x.pdf`, new Blob(["%PDF-"]), {
      contentType: "application/pdf",
    });
    expect(forged.error).not.toBeNull();
  });

  it("anonymous clients see nothing", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anonClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    const { data } = await anonClient.from("candidates").select("id");
    expect(data ?? []).toHaveLength(0);
    const { error } = await anonClient.rpc("create_organization", { p_name: "x", p_slug: "anon-org" });
    expect(error).not.toBeNull();
  });
});
