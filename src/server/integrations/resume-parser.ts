import "server-only";
import { z } from "zod";
import { aiEnabled, structured, tryAi, UNTRUSTED_RULES } from "./openai";

/**
 * Resume text extraction for uploaded candidate documents (runs in the worker after the scan).
 * Text-layer PDFs and DOCX are read locally; a scanned PDF (no text layer) is transcribed by
 * OpenAI when configured. The document is untrusted data; output is Zod-validated.
 */
export interface ResumeParser {
  readonly name: string;
  extractText(bytes: Uint8Array, mimeType: string): Promise<string | null>;
}

const MAX_TEXT = 100_000;
const hasText = (s: string | null | undefined): s is string => !!s && s.replace(/\s/g, "").length >= 40;

async function localText(bytes: Uint8Array, mimeType: string): Promise<string | null> {
  try {
    if (mimeType === "application/pdf") {
      const { extractText } = await import("unpdf");
      return (await extractText(bytes.slice(), { mergePages: true })).text;
    }
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
  } catch {
    return null; // encrypted / malformed
  }
}

class LocalResumeParser implements ResumeParser {
  readonly name: string = "local";
  async extractText(bytes: Uint8Array, mimeType: string): Promise<string | null> {
    const text = await localText(bytes, mimeType);
    return hasText(text) ? text.slice(0, MAX_TEXT) : null;
  }
}

const transcriptSchema = z.object({ text: z.string() });

class OpenAiResumeParser extends LocalResumeParser {
  override readonly name = "openai";
  override async extractText(bytes: Uint8Array, mimeType: string): Promise<string | null> {
    const local = await super.extractText(bytes, mimeType);
    if (local || mimeType !== "application/pdf") return local;
    const r = await tryAi(() =>
      structured({
        task: "resume.transcribe",
        system: `You transcribe scanned resumes to plain text. ${UNTRUSTED_RULES} Keep the original language, section order and dates; use "• " for bullets. No commentary.`,
        user: "Transcribe the attached resume.",
        schema: transcriptSchema,
        schemaName: "resume_transcript",
        files: [{ filename: "resume.pdf", mimeType: "application/pdf", bytes }],
        timeoutMs: 120_000,
      }),
    );
    return hasText(r?.text) ? r.text.slice(0, MAX_TEXT) : null;
  }
}

export function getResumeParser(): ResumeParser {
  return aiEnabled() ? new OpenAiResumeParser() : new LocalResumeParser();
}
