import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class ImportError extends Error {
  constructor(public readonly code: "invalidUrl" | "blockedSite" | "fetchFailed" | "notHtml" | "fileType" | "fileSize" | "noText" | "tooShort") {
    super(code);
    this.name = "ImportError";
  }
}

// ---------------------------------------------------------------------------------------------
// Link → HTML. The URL is user-supplied, so this is an SSRF surface: https only, default port,
// no credentials, every hop's address must be public, small timeout and response cap.

const MAX_PAGE_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 4;
// Sites that refuse automated reads (login walls / bot protection). Fail fast with a clear message.
const BLOCKED = /(^|\.)(linkedin\.com|indeed\.[a-z.]+|glassdoor\.[a-z.]+|ziprecruiter\.com)$/i;

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function isPrivate(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateV4(ip);
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]);
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("64:ff9b") || v6.startsWith("2001:db8");
}

async function assertPublic(url: URL) {
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new ImportError("invalidUrl");
  if (BLOCKED.test(url.hostname)) throw new ImportError("blockedSite");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addrs: { address: string }[];
  try {
    addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new ImportError("fetchFailed");
  }
  if (!addrs.length || addrs.some((a) => isPrivate(a.address))) throw new ImportError("invalidUrl");
}

export function normalizeUrl(raw: string): URL {
  const s = raw.trim();
  try {
    return new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    throw new ImportError("invalidUrl");
  }
}

export async function fetchPage(raw: string): Promise<{ html: string; url: URL }> {
  let url = normalizeUrl(raw);
  // Note: fetch re-resolves DNS, so a rebinding host could still slip between check and connect.
  // Acceptable here: responses are only parsed as text, never returned raw, and private hosts fail the check.
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
        headers: { "user-agent": "MissionHub-JobImport/1.0", accept: "text/html,application/xhtml+xml,text/plain;q=0.8" },
        cache: "no-store",
      });
    } catch {
      throw new ImportError("fetchFailed");
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel();
      if (!loc) throw new ImportError("fetchFailed");
      url = new URL(loc, url);
      continue;
    }
    if ([401, 403, 429, 999].includes(res.status)) {
      await res.body?.cancel();
      throw new ImportError("blockedSite");
    }
    if (!res.ok || !res.body) throw new ImportError("fetchFailed");
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml|text\/plain/i.test(type)) {
      await res.body.cancel();
      throw new ImportError("notHtml");
    }
    return { html: await readCapped(res.body), url };
  }
  throw new ImportError("fetchFailed");
}

async function readCapped(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PAGE_BYTES) {
      await reader.cancel();
      break; // keep what we have: the posting is near the top of the page
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

// ---------------------------------------------------------------------------------------------
// File → text. PDF (text layer only — scanned PDFs have none), DOCX, TXT. Type is checked by magic bytes.

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

export async function readFileText(file: File): Promise<string> {
  if (file.size === 0) throw new ImportError("noText");
  if (file.size > MAX_IMPORT_FILE_BYTES) throw new ImportError("fileSize");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const head = String.fromCharCode(...bytes.subarray(0, 5));

  let text: string;
  if (head === "%PDF-") {
    const { extractText } = await import("unpdf");
    try {
      text = (await extractText(bytes, { mergePages: true })).text;
    } catch {
      throw new ImportError("noText"); // encrypted or malformed PDF
    }
  } else if (head.startsWith("PK\u0003\u0004") && name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
  } else if (name.endsWith(".txt") || name.endsWith(".md")) {
    text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } else {
    throw new ImportError("fileType");
  }
  if (text.replace(/\s/g, "").length < 40) throw new ImportError("noText");
  return text;
}
