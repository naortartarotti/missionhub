import "server-only";
import type { AdminClient } from "@/server/supabase/admin";

const ext = (mime: string) => (mime === "application/pdf" ? "pdf" : "docx");

/** Copies approved documents into the referral bucket so the target never touches A's originals. */
export async function copyReferralDocuments(db: AdminClient, referralId: string) {
  const { data: grants, error } = await db
    .from("referral_document_grants")
    .select("id, mime_type, status, revoked_at, referral_document_sources(candidate_document_id, candidate_documents(storage_path))")
    .eq("referral_id", referralId)
    .eq("status", "pending_copy")
    .is("revoked_at", null);
  if (error) throw error;

  for (const g of grants ?? []) {
    const src = (g.referral_document_sources as unknown as { candidate_documents: { storage_path: string } } | null)
      ?.candidate_documents?.storage_path;
    if (!src) {
      await db.rpc("mark_grant_copied", { p_grant: g.id, p_path: "", p_ok: false });
      continue;
    }
    const { data: blob, error: dlErr } = await db.storage.from("candidate-documents").download(src);
    if (dlErr) throw dlErr;
    const dest = `${referralId}/${g.id}.${ext(g.mime_type)}`;
    const { error: upErr } = await db.storage
      .from("referral-documents")
      .upload(dest, blob, { contentType: g.mime_type, upsert: true });
    if (upErr) throw upErr;
    const { error: mErr } = await db.rpc("mark_grant_copied", { p_grant: g.id, p_path: dest, p_ok: true });
    if (mErr) throw mErr;
  }
}

/** After a sharing authorization is revoked, physically remove the referral copies. */
export async function purgeReferralDocuments(db: AdminClient, referralId: string) {
  const { data: files, error } = await db.storage.from("referral-documents").list(referralId);
  if (error) throw error;
  if (files?.length) {
    const { error: rmErr } = await db.storage.from("referral-documents").remove(files.map((f) => `${referralId}/${f.name}`));
    if (rmErr) throw rmErr;
  }
}
