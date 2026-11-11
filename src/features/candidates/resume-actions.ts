"use server";

import { z } from "zod";
import { guard, parse, rateLimit } from "@/server/actions/guard";
import { assertCan, getRequestContext } from "@/server/auth/context";
import type { ActionResult } from "@/lib/actions/result";
import { msg } from "@/i18n/translate";
import { aiEnabled, tryAi } from "@/server/integrations/openai";
import { fetchDocument, ImportError, normalizeUrl, readImportFile } from "@/features/jobs/import/sources";
import { htmlToText, pageTitle } from "@/features/jobs/import/html";
import { MAX_DOC_BYTES } from "./schemas";
import { extractResumeRuleBased, extractResumeWithAi, type ResumeDraft } from "./resume-ai";

export type ResumeImportResult = { draft: ResumeDraft; filled: (keyof ResumeDraft)[]; ai: boolean };

const IMPORT_ERRORS = new Set(["fileType", "fileSize", "noText", "tooShort", "invalidUrl", "blockedSite", "fetchFailed", "notHtml"]);

/** Google Drive "view" links serve a viewer page; the direct download serves the PDF itself. */
function directLink(raw: string): string {
  const url = normalizeUrl(raw);
  if (url.hostname === "drive.google.com") {
    const id = url.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ?? url.searchParams.get("id");
    if (id) return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
  }
  return url.toString();
}

/**
 * Pre-fills the new-candidate form from a resume: PDF (scanned too when AI is on), DOCX, TXT,
 * pasted text, or a public link (portfolio, personal site, GitHub, hosted PDF, Google Drive).
 * Nothing is saved: the recruiter reviews the form, then records permission as usual.
 * The resume is untrusted data; it is sent to OpenAI (store: false) only when the key is configured.
 */
export async function importResume(orgSlug: string, formData: FormData): Promise<ActionResult<ResumeImportResult>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "candidates:write");
    const mode = parse(z.enum(["text", "file", "url"]), formData.get("mode"));
    await rateLimit(ctx.db, "candidate.resume_import", 60, 3600);
    try {
      let text: string | null;
      let pdf: { name: string; bytes: Uint8Array } | null = null;
      let title: string | null = null;
      if (mode === "url") {
        const raw = parse(z.string().trim().min(4, msg("candidates.resume.errors.invalidUrl")).max(2000), formData.get("url") ?? "");
        if (/(^|\.)linkedin\.com$/i.test(normalizeUrl(raw).hostname)) return { ok: false, error: msg("candidates.resume.errors.linkedin") };
        const doc = await fetchDocument(directLink(raw), { allowPdf: true, maxPdfBytes: MAX_DOC_BYTES });
        if (doc.kind === "pdf") {
          const f = await readImportFile(new File([doc.bytes.slice()], "resume.pdf", { type: "application/pdf" }), MAX_DOC_BYTES);
          text = f.text;
          if (!text && f.pdf) pdf = { name: f.name, bytes: f.pdf };
        } else {
          title = pageTitle(doc.html);
          text = htmlToText(doc.html);
          if (text.replace(/\s/g, "").length < 120) text = null;
        }
        if (!text && !(pdf && aiEnabled())) throw new ImportError("noText");
      } else if (mode === "text") {
        text = parse(z.string().max(50000, msg("candidates.resume.errors.tooLong")), formData.get("text") ?? "");
        if (text.trim().length < 40) throw new ImportError("tooShort");
      } else {
        const file = formData.get("file");
        if (!(file instanceof File)) throw new ImportError("fileType");
        const f = await readImportFile(file, MAX_DOC_BYTES);
        text = f.text;
        if (!text && f.pdf) pdf = { name: f.name, bytes: f.pdf };
        if (!text && !aiEnabled()) throw new ImportError("noText");
      }

      const ai = await tryAi(() =>
        extractResumeWithAi(text ? { text: title ? `${title}\n\n${text}` : text } : { file: { filename: pdf!.name, mimeType: "application/pdf", bytes: pdf!.bytes } }),
      );
      if (!ai && !text) throw new ImportError("noText");
      const draft: ResumeDraft = ai ?? extractResumeRuleBased(text!);
      const filled = (Object.keys(draft) as (keyof ResumeDraft)[]).filter((k) => k !== "source" && draft[k]);
      return { ok: true, data: { draft, filled, ai: !!ai } };
    } catch (e) {
      if (e instanceof ImportError && IMPORT_ERRORS.has(e.code)) return { ok: false, error: msg(`candidates.resume.errors.${e.code as "fileType"}`) };
      if (e instanceof ImportError) return { ok: false, error: msg("candidates.resume.errors.noText") };
      throw e;
    }
  });
}
