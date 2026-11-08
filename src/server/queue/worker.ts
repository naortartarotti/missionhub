import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/server/supabase/admin";
import { recomputeForCandidate, recomputeForJob } from "@/features/matching/infrastructure/matching-service";
import { scanDocument } from "./handlers/documents";
import { copyReferralDocuments, purgeReferralDocuments } from "./handlers/referral-documents";

type Job = { id: string; kind: string; payload: Record<string, unknown>; attempts: number };

const handlers: Record<string, (job: Job) => Promise<unknown>> = {
  "match.candidate": (j) => recomputeForCandidate(createAdminClient(), String(j.payload.candidate_id)),
  "match.job": (j) => recomputeForJob(createAdminClient(), String(j.payload.job_id)),
  "document.scan": (j) => scanDocument(createAdminClient(), String(j.payload.document_id)),
  "referral.copy_documents": (j) => copyReferralDocuments(createAdminClient(), String(j.payload.referral_id)),
  "referral.purge_documents": (j) => purgeReferralDocuments(createAdminClient(), String(j.payload.referral_id)),
};

const workerId = `worker-${randomUUID().slice(0, 8)}`;

/** Claims and processes one batch. Returns the number of jobs processed. */
export async function runOnce(limit = 10): Promise<number> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("claim_background_jobs", { p_worker: workerId, p_limit: limit });
  if (error) throw error;
  const jobs = (data ?? []) as unknown as Job[];
  for (const job of jobs) {
    const started = Date.now();
    try {
      const handler = handlers[job.kind];
      if (!handler) throw new Error(`No handler for ${job.kind}`);
      await handler(job);
      await db.rpc("complete_background_job", { p_id: job.id });
      // Privacy-aware log: ids & timings only, never payload contents.
      console.info(JSON.stringify({ evt: "job.ok", kind: job.kind, id: job.id, ms: Date.now() - started }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.rpc("fail_background_job", { p_id: job.id, p_error: message });
      console.error(JSON.stringify({ evt: "job.failed", kind: job.kind, id: job.id, attempt: job.attempts, error: message.slice(0, 200) }));
    }
  }
  return jobs.length;
}

export async function drain(maxRounds = 50) {
  let total = 0;
  for (let i = 0; i < maxRounds; i++) {
    const n = await runOnce(25);
    total += n;
    if (n === 0) break;
  }
  return total;
}

export async function runForever(intervalMs = 1500) {
  console.info(JSON.stringify({ evt: "worker.start", workerId }));
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  while (!stopping) {
    try {
      const n = await runOnce();
      if (n === 0) await new Promise((r) => setTimeout(r, intervalMs));
    } catch (e) {
      console.error(JSON.stringify({ evt: "worker.error", error: e instanceof Error ? e.message : String(e) }));
      await new Promise((r) => setTimeout(r, intervalMs * 4));
    }
  }
}
