import "server-only";

/**
 * Resume extraction adapter. The MVP ships without an AI/extraction provider: the noop parser
 * returns null and recruiters enter structured data manually. A provider implementation must
 * treat document text as untrusted data (never instructions) and validate output with Zod.
 */
export interface ResumeParser {
  readonly name: string;
  extractText(bytes: Uint8Array, mimeType: string): Promise<string | null>;
}

class NoopResumeParser implements ResumeParser {
  readonly name = "none";
  async extractText(): Promise<string | null> {
    return null;
  }
}

export function getResumeParser(): ResumeParser {
  // Future: switch on process.env.AI_PROVIDER once a provider adapter is implemented.
  return new NoopResumeParser();
}
