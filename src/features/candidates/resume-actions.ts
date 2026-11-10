"use server";

import { z } from "zod";
import { guard, parse, rateLimit } from "@/server/actions/guard";
import { assertCan, getRequestContext } from "@/server/auth/context";
import type { ActionResult } from "@/lib/actions/result";
import { msg } from "@/i18n/translate";
import { aiEnabled, tryAi } from "@/server/integrations/openai";
import { ImportError, readImportFile } from "@/features/jobs/import/sources";
import { MAX_DOC_BYTES } from "./schemas";
import { extractResumeRuleBased, extractResumeWithAi, type ResumeDraft } from "./resume-ai";

export type ResumeImportResult = { draft: ResumeDraft; filled: (keyof ResumeDraft)[]; ai: boolean };

const IMPORT_ERRORS = new Set(["fileType", "fileSize", "noText", "tooShort"]);

/**
 * Pre-fills the new-candidate form from a resume (PDF — scanned too when AI is on —, DOCX, TXT or
 * pasted text). Nothing is saved: the recruiter reviews the form, then records permission as usual.
 * The resume is untrusted data; it is sent to OpenAI (store: false) only when the key is configured.
 */
export async function importResume(orgSlug: string, formData: FormData): Promise<ActionResult<ResumeImportResult>> {
  return guard(async () => {
    const ctx = await getRequestContext(orgSlug);
    assertCan(ctx, "candidates:write");
    const mode = parse(z.enum(["text", "file"]), formData.get("mode"));
    await rateLimit(ctx.db, "candidate.resume_import", 60, 3600);
    try {
      let text: string | null;
      let pdf: { name: string; bytes: Uint8Array } | null = null;
      if (mode === "text") {
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
        extractResumeWithAi(text ? { text } : { file: { filename: pdf!.name, mimeType: "application/pdf", bytes: pdf!.bytes } }),
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
