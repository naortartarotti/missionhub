import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/server/supabase/admin";
import { describeError } from "./errors";
import { recomputeForCandidate, recomputeForJob } from "@/features/matching/infrastructure/matching-service";
import { scanDocument } from "./handlers/documents";
import { copyReferralDocuments, purgeReferralDocuments } from "./handlers/referral-documents";
import { runConnectionSync } from "@/features/connectors/sync";
import { runPresentationMaintenance, scanClaimEvidence } from "./handlers/claim-evidence";
import { purgeOrphanConductFiles, scanConductEvidence } from "./handlers/conduct-evidence";
import { purgeOrphanHireFiles, scanHireEvidence } from "./handlers/hire-evidence";

type Job = { id: string; kind: string; payload: Record<string, unknown>; attempts: number };

const handlers: Record<string, (job: Job) => Promise<unknown>> = {
  "match.candidate": (j) => recomputeForCandidate(createAdminClient(), String(j.payload.candidate_id)),
  "match.job": (j) => recomputeForJob(createAdminClient(), String(j.payload.job_id)),
  "document.scan": (j) => scanDocument(createAdminClient(), String(j.payload.document_id)),
  "referral.copy_documents": (j) => copyReferralDocuments(createAdminClient(), String(j.payload.referral_id)),
  "referral.purge_documents": (j) => purgeReferralDocuments(createAdminClient(), String(j.payload.referral_id)),
  "claim_evidence.scan": (j) => scanClaimEvidence(createAdminClient(), String(j.payload.file_id)),
  "hire_evidence.scan": (j) => scanHireEvidence(createAdminClient(), String(j.payload.file_id)),  // N3
  "conduct_evidence.scan": (j) => scanConductEvidence(createAdminClient(), String(j.payload.file_id)),
  "connector.sync": (j) => runConnectionSync(createAdminClient(), String(j.payload.connection_id), j.payload.trigger === "manual" ? "manual" : "schedule"),
};

const workerId = `worker-${randomUUID().slice(0, 8)}`;

/** Queues connector syncs that are due (each connection has its own interval). */
export async function scheduleConnectorSyncs(): Promise<number> {
  const { data, error } = await createAdminClient().rpc("enqueue_due_connector_syncs");
  if (error) throw error;
  return data ?? 0;
}

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
      const { message, code } = describeError(e);
      await db.rpc("fail_background_job", { p_id: job.id, p_error: code ? `${code}: ${message}` : message });
      console.error(JSON.stringify({ evt: "job.failed", kind: job.kind, id: job.id, attempt: job.attempts, code, error: message.slice(0, 200) }));
    }
  }
  return jobs.length;
}

/** N1 maintenance (final claims, BR-21 purges, orphan evidence cleanup) and N10 orphan conduct files. */
export async function runMaintenance() {
  const db = createAdminClient();
  const n1 = await runPresentationMaintenance(db);
  const conductOrphans = await purgeOrphanConductFiles(db);
  // N3 (BR-31): overdue fee details notify the hiring side once; drop 2 adds the hire-report clocks.
  const hire = await db.rpc("run_hire_maintenance");
  if (hire.error) throw hire.error;
  const hireOrphans = await purgeOrphanHireFiles(db);
  return { ...n1, conductOrphans, hire: hire.data, hireOrphans };
}

export async function drain(maxRounds = 50) {
  await scheduleConnectorSyncs();
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
  let nextSchedule = 0;
  let nextMaintenance = 0;
  while (!stopping) {
    try {
      if (Date.now() >= nextSchedule) {
        nextSchedule = Date.now() + 60_000;
        await scheduleConnectorSyncs();
      }
      if (Date.now() >= nextMaintenance) {
        nextMaintenance = Date.now() + 10 * 60_000;
        const m = await runMaintenance();
        console.info(JSON.stringify({ evt: "maintenance.ok", ...m }));
      }
      const n = await runOnce();
      if (n === 0) await new Promise((r) => setTimeout(r, intervalMs));
    } catch (e) {
      console.error(JSON.stringify({ evt: "worker.error", error: e instanceof Error ? e.message : String(e) }));
      await new Promise((r) => setTimeout(r, intervalMs * 4));
    }
  }
}
