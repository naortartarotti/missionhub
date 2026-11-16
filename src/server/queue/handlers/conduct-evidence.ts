import "server-only";
import type { AdminClient } from "@/server/supabase/admin";
import { evidenceVerdictIsolated, sha256Hex } from "./claim-evidence";

/**
 * N10 conduct-report evidence (BR-16, EC-8): the same scan and SHA-256 as N1 claim evidence, on the
 * private `conduct-evidence` bucket. The hash is computed here from the stored object, never from
 * anything the app or the browser sent, and recorded once by record_conduct_evidence_scan.
 */
export const CONDUCT_EVIDENCE_BUCKET = "conduct-evidence";

export async function scanConductEvidence(db: AdminClient, fileId: string) {
  const { data: target, error } = await db.rpc("conduct_evidence_scan_target", { p_file: fileId });
  if (error) throw error;
  if (!target) return; // already scanned, or removed before the scan
  const t = target as { storage_path: string; mime_type: string; size_bytes: number };
  const { data: blob, error: dlErr } = await db.storage.from(CONDUCT_EVIDENCE_BUCKET).download(t.storage_path);
  if (dlErr) throw dlErr;
  const buffer = await blob.arrayBuffer();
  const sha256 = sha256Hex(new Uint8Array(buffer)); // before the buffer is transferred to the scan thread
  const verdict = await evidenceVerdictIsolated(buffer, t.mime_type, t.size_bytes);
  const { error: recErr } = await db.rpc("record_conduct_evidence_scan", { p_file: fileId, p_verdict: verdict, p_sha256: verdict === "clean" ? sha256 : "" });
  if (recErr) throw recErr;
}

/** Deletes draft files never attached within 24 h (rows marked removed by purge_orphan_conduct_files). */
export async function purgeOrphanConductFiles(db: AdminClient) {
  const { data, error } = await db.rpc("purge_orphan_conduct_files");
  if (error) throw error;
  const paths = (data ?? []) as string[];
  if (paths.length) {
    const { error: rmErr } = await db.storage.from(CONDUCT_EVIDENCE_BUCKET).remove(paths);
    if (rmErr) throw rmErr;
  }
  return paths.length;
}
