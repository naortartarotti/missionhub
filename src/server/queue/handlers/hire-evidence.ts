import "server-only";
import type { AdminClient } from "@/server/supabase/admin";
import { evidenceVerdictIsolated, sha256Hex } from "./claim-evidence";

/**
 * N3 hire-report evidence (hire reports, contests, rebuttals, authorization checks): the same scan and SHA-256 rules
 * as N1 claim evidence, on the private `hire-evidence` bucket. The hash comes only from the stored object.
 */
export const HIRE_EVIDENCE_BUCKET = "hire-evidence";

export async function scanHireEvidence(db: AdminClient, fileId: string) {
  const { data: target, error } = await db.rpc("hire_evidence_scan_target", { p_file: fileId });
  if (error) throw error;
  if (!target) return; // already scanned, or removed before the scan
  const t = target as { storage_path: string; mime_type: string; size_bytes: number };
  const { data: blob, error: dlErr } = await db.storage.from(HIRE_EVIDENCE_BUCKET).download(t.storage_path);
  if (dlErr) throw dlErr;
  const buffer = await blob.arrayBuffer();
  const sha256 = sha256Hex(new Uint8Array(buffer)); // before the buffer is transferred to the scan thread
  const verdict = await evidenceVerdictIsolated(buffer, t.mime_type, t.size_bytes);
  const { error: recErr } = await db.rpc("record_hire_evidence_scan", { p_file: fileId, p_verdict: verdict, p_sha256: verdict === "clean" ? sha256 : "" });
  if (recErr) throw recErr;
}

/** Drafts never filed within 24 h and objects never registered: delete the objects (maintenance timer). */
export async function purgeOrphanHireFiles(db: AdminClient) {
  const { data, error } = await db.rpc("purge_orphan_hire_files");
  if (error) throw error;
  const paths = (data ?? []) as string[];
  if (paths.length) {
    const { error: rmErr } = await db.storage.from(HIRE_EVIDENCE_BUCKET).remove(paths);
    if (rmErr) throw rmErr;
  }
  return paths.length;
}
