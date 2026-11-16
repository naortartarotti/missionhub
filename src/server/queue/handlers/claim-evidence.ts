import "server-only";
import { createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
import type { AdminClient } from "@/server/supabase/admin";

/**
 * Prior-presentation claim evidence (N1, EC-4). The SHA-256 shown to the sourcing side is computed
 * here, from the stored object, never from anything the app or the browser sent. The database
 * records it once and refuses to change it afterwards.
 */
export const CLAIM_EVIDENCE_BUCKET = "claim-evidence";
// The pure scan lives in pdf-scan.mjs (plain ESM) so it can run inside a worker thread.
export { evidenceVerdict, pdfHasActiveContent } from "./pdf-scan.mjs";

export type Verdict = "clean" | "rejected";
export const SCAN_TIMEOUT_MS = 3_000;

/**
 * Runs the verdict in an isolated worker thread (QA final F-1). The bytes are transferred, not
 * copied (the caller's buffer is detached afterwards). The parent enforces a hard wall-clock
 * timeout and memory limits: on timeout, crash, out-of-memory or any error the thread is
 * terminated and the file is **rejected**. Nothing can stall the queue worker's event loop.
 */
export function evidenceVerdictIsolated(
  buffer: ArrayBuffer,
  mime: string,
  declaredSize: number,
  opts: { timeoutMs?: number; scanBudgetMs?: number } = {},
): Promise<Verdict> {
  const timeoutMs = opts.timeoutMs ?? SCAN_TIMEOUT_MS;
  return new Promise<Verdict>((resolve) => {
    let settled = false;
    let worker: Worker | undefined;
    const done = (v: Verdict) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker?.terminate();
      resolve(v);
    };
    const timer = setTimeout(() => done("rejected"), timeoutMs);
    try {
      worker = new Worker(new URL("./pdf-scan-worker.mjs", import.meta.url), {
        workerData: { buffer, mime, declaredSize, scanBudgetMs: opts.scanBudgetMs ?? Math.max(1, timeoutMs - 500) },
        transferList: [buffer],
        resourceLimits: { maxOldGenerationSizeMb: 384, maxYoungGenerationSizeMb: 64, codeRangeSizeMb: 16, stackSizeMb: 4 },
        // Plain ESM entry: don't inherit tsx/vitest loader flags it doesn't need.
        execArgv: [],
      });
    } catch {
      done("rejected");
      return;
    }
    worker.once("message", (v: unknown) => done(v === "clean" ? "clean" : "rejected"));
    worker.once("error", () => done("rejected"));
    worker.once("exit", () => done("rejected"));
  });
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function scanClaimEvidence(db: AdminClient, fileId: string) {
  const { data: target, error } = await db.rpc("claim_evidence_scan_target", { p_file: fileId });
  if (error) throw error;
  // Already scanned, or removed before the scan: nothing to do.
  if (!target) return;
  const t = target as { storage_path: string; mime_type: string; size_bytes: number };
  const { data: blob, error: dlErr } = await db.storage.from(CLAIM_EVIDENCE_BUCKET).download(t.storage_path);
  if (dlErr) throw dlErr;
  const buffer = await blob.arrayBuffer();
  // Hash first: the buffer is transferred to the scan thread (and detached here) afterwards.
  const sha256 = sha256Hex(new Uint8Array(buffer));
  const verdict = await evidenceVerdictIsolated(buffer, t.mime_type, t.size_bytes);
  const { error: recErr } = await db.rpc("record_claim_evidence_scan", {
    p_file: fileId,
    p_verdict: verdict,
    p_sha256: verdict === "clean" ? sha256 : "",
  });
  if (recErr) throw recErr;
}

/**
 * N1 maintenance, on the worker timer (service role): materialise final claims, purge
 * fingerprints and expired sticky stops (BR-21), and delete evidence objects uploaded but never
 * filed with a claim. Correctness never depends on this running (lazy finality, EC-7).
 */
export async function runPresentationMaintenance(db: AdminClient) {
  const finalized = await db.rpc("finalize_due_claims");
  if (finalized.error) throw finalized.error;
  const purged = await db.rpc("purge_presentation_data");
  if (purged.error) throw purged.error;
  const orphans = await db.rpc("purge_orphan_claim_files");
  if (orphans.error) throw orphans.error;
  const paths = (orphans.data ?? []) as string[];
  if (paths.length) {
    const { error: rmErr } = await db.storage.from(CLAIM_EVIDENCE_BUCKET).remove(paths);
    if (rmErr) throw rmErr;
    const { error: fErr } = await db.rpc("forget_claim_files", { p_paths: paths });
    if (fErr) throw fErr;
  }
  return { finalized: finalized.data ?? 0, orphans: paths.length };
}
