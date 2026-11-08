import "server-only";
import type { AdminClient } from "@/server/supabase/admin";
import { getResumeParser } from "@/server/integrations/resume-parser";

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK.. (DOCX container)

function startsWith(buf: Uint8Array, magic: number[]) {
  return magic.every((b, i) => buf[i] === b);
}

/**
 * Controlled document pipeline: verify the declared type against file signatures, reject
 * active content markers, then extract text through the ResumeParser adapter.
 * NOTE: signature + heuristic checks are not a full antivirus. A real malware scanner
 * (e.g. ClamAV sidecar) plugs in here — see docs/security-and-privacy.md.
 */
export async function scanDocument(db: AdminClient, documentId: string) {
  const { data: doc, error } = await db
    .from("candidate_documents")
    .select("id, storage_path, mime_type, size_bytes")
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw error;
  if (!doc) return;

  const { data: blob, error: dlErr } = await db.storage.from("candidate-documents").download(doc.storage_path);
  if (dlErr) throw dlErr;
  const bytes = new Uint8Array(await blob.arrayBuffer());

  let verdict: "clean" | "rejected" = "clean";
  if (bytes.byteLength !== doc.size_bytes || bytes.byteLength > 10 * 1024 * 1024) verdict = "rejected";
  if (doc.mime_type === "application/pdf" && !startsWith(bytes, PDF_MAGIC)) verdict = "rejected";
  if (doc.mime_type !== "application/pdf" && !startsWith(bytes, ZIP_MAGIC)) verdict = "rejected";
  if (verdict === "clean" && doc.mime_type === "application/pdf") {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.byteLength, 2_000_000)));
    if (/\/JavaScript|\/JS\s|\/Launch|\/EmbeddedFile/.test(head)) verdict = "rejected";
  }

  let extracted: string | null = null;
  if (verdict === "clean") {
    extracted = await getResumeParser().extractText(bytes, doc.mime_type);
  }
  const { error: upErr } = await db
    .from("candidate_documents")
    .update({ scan_status: verdict, extracted_text: extracted })
    .eq("id", doc.id);
  if (upErr) throw upErr;
}
