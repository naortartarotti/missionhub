// Claim-evidence verdict (N1, BR-15, EC-4). Plain ESM with no app imports, so the same code runs in
// unit tests and inside the isolated worker thread (pdf-scan-worker.mjs) under any runtime.
//
// Heuristic, not an antivirus. Fail closed: anything the scanner can't fully inspect is rejected.
import { inflateSync } from "node:zlib";

export const MAX_BYTES = 10 * 1024 * 1024;
const DECODE_BUDGET = 64 * 1024 * 1024; // total decoded bytes per file
export const SCAN_BUDGET_MS = 2_000; // in-scan budget; the worker-thread timeout is the hard backstop

const SIGNATURES = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff],
};

// PDF names that run code, open things or submit data, matched as whole names after decoding #xx
// escapes. /URI alone is allowed (links are normal in exported emails).
const PDF_ACTIVE = /\/(JavaScript|JS|Launch|EmbeddedFile|EmbeddedFiles|OpenAction|AA|SubmitForm|ImportData|RichMedia|XFA|GoToE|GoToR)(?![A-Za-z0-9])/;
const ENCRYPT = /\/Encrypt(?![A-Za-z0-9])/;

const FILTER_KIND = {
  FlateDecode: "flate", Fl: "flate",
  ASCIIHexDecode: "hex", AHx: "hex",
  ASCII85Decode: "a85", A85: "a85",
  DCTDecode: "image", DCT: "image", JPXDecode: "image", CCITTFaxDecode: "image", CCF: "image", JBIG2Decode: "image",
};

class Unscannable extends Error {}

const isWs = (c) => c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 0;
const isDelim = (c) => isWs(c) || c === 47 /* / */ || c === 91 || c === 93 || c === 60 || c === 62 || c === 40 || c === 41 || c === 37 || c === 123 || c === 125;

/** Decodes #xx escapes inside names, in one linear pass. */
export function decodeNames(text) {
  return text.replace(/\/[^\s/<>\[\]()%{}]*/g, (name) =>
    name.indexOf("#") < 0 ? name : name.replace(/#([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))));
}

const checkDeadline = (deadline) => {
  if (Date.now() > deadline) throw new Unscannable("time budget");
};

/** Reads the value after the last `key` in a dictionary text with a bounded tokenizer (F-1). */
function lastValue(dict, key) {
  let i = dict.length;
  for (;;) {
    i = dict.lastIndexOf(key, i - 1);
    if (i < 0) return null;
    const after = dict.charCodeAt(i + key.length);
    if (Number.isNaN(after) || isDelim(after)) break; // whole name, not /FilterX
    if (i === 0) return null;
  }
  return dict.slice(i + key.length, i + key.length + 600); // bounded window
}

/** Filter chain of a stream dictionary. Throws for anything but literal names (F-2: no indirect refs). */
function filterChain(dict) {
  const v = lastValue(dict, "/Filter");
  if (v === null) return [];
  const t = v.replace(/^[\s\0]+/, "");
  if (t.startsWith("/")) {
    const m = /^\/([^\s/<>\[\]()%{}]+)/.exec(t);
    if (!m) throw new Unscannable("filter name");
    return [m[1]];
  }
  if (t.startsWith("[")) {
    const close = t.indexOf("]");
    if (close < 0) throw new Unscannable("filter array"); // longer than the window, or unclosed
    const body = t.slice(1, close).trim();
    if (body === "") return [];
    const names = body.split(/[\s\0]+|(?=\/)/).filter(Boolean);
    if (!names.every((n) => /^\/[^\s/<>\[\]()%{}]+$/.test(n))) throw new Unscannable("filter array item"); // indirect refs etc.
    return names.map((n) => n.slice(1));
  }
  throw new Unscannable("non-literal filter"); // /Filter 5 0 R
}

/** Rejects an indirect /DecodeParms (F-2). */
function checkDecodeParms(dict) {
  const v = lastValue(dict, "/DecodeParms");
  if (v !== null && /^[\s\0]*\d+[\s\0]+\d+[\s\0]+R/.test(v)) throw new Unscannable("indirect DecodeParms");
}

/** /Length as a direct integer, or null when absent or indirect. */
function directLength(dict) {
  const v = lastValue(dict, "/Length");
  if (v === null) return null;
  const m = /^[\s\0]*(\d{1,10})(?![\d.])([\s\0]+\d+[\s\0]+R)?/.exec(v);
  if (!m || m[2]) return null;
  return Number(m[1]);
}

function asciiHex(data) {
  const s = data.toString("latin1");
  const end = s.indexOf(">");
  if (end < 0) throw new Unscannable("ASCIIHex without EOD");
  let hex = s.slice(0, end).replace(/[\s\0]+/g, "");
  if (!/^[0-9A-Fa-f]*$/.test(hex)) throw new Unscannable("bad ASCIIHex");
  if (hex.length % 2) hex += "0";
  return Buffer.from(hex, "hex");
}

function ascii85(data, deadline) {
  let s = data.toString("latin1");
  const end = s.indexOf("~>");
  if (end < 0) throw new Unscannable("ASCII85 without EOD");
  s = s.slice(0, end).replace(/[\s\0]+/g, "");
  if (s.startsWith("<~")) s = s.slice(2);
  const out = Buffer.alloc(Math.ceil(s.length / 5) * 4 + s.length * 4);
  let o = 0;
  let acc = 0;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if ((i & 0xffff) === 0) checkDeadline(deadline);
    const ch = s.charCodeAt(i);
    if (ch === 122 /* z */ && n === 0) { out.writeUInt32BE(0, o); o += 4; continue; }
    const c = ch - 33;
    if (c < 0 || c > 84) throw new Unscannable("bad ASCII85");
    acc = acc * 85 + c;
    if (++n === 5) {
      if (acc > 0xffffffff) throw new Unscannable("bad ASCII85 group");
      out.writeUInt32BE(acc, o); o += 4; acc = 0; n = 0;
    }
  }
  if (n === 1) throw new Unscannable("bad ASCII85 tail");
  if (n > 0) {
    const k = n;
    for (; n < 5; n++) acc = acc * 85 + 84;
    if (acc > 0xffffffff) throw new Unscannable("bad ASCII85 group");
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(acc, 0);
    tail.copy(out, o, 0, k - 1); o += k - 1;
  }
  return out.subarray(0, o);
}

/**
 * One forward walk over the streams (linear: each look-back covers only the text since the
 * previous stream). Returns the decoded content of every non-image stream. Throws Unscannable for
 * anything it can't inspect.
 */
function decodedStreams(buf, text, deadline) {
  const out = [];
  let total = 0;
  let prevEnd = 0;
  let pos = 0;
  for (;;) {
    checkDeadline(deadline);
    const k = text.indexOf("stream", pos);
    if (k < 0) break;
    pos = k + 6;
    if (k >= 3 && text.startsWith("end", k - 3)) continue; // "endstream"
    // Only a whole word can be the keyword ("upstream", "streams" are text).
    if (k > 0 && !isDelim(text.charCodeAt(k - 1))) continue;
    // F-2: after the keyword, optional spaces / tabs, then CRLF or LF.
    let e = k + 6;
    while (e < text.length && e < k + 262 && (text.charCodeAt(e) === 32 || text.charCodeAt(e) === 9)) e++;
    let start = -1;
    if (text.charCodeAt(e) === 13 && text.charCodeAt(e + 1) === 10) start = e + 2;
    else if (text.charCodeAt(e) === 10) start = e + 1;
    // The keyword follows its dictionary's ">>" (whitespace allowed).
    let b = k - 1;
    while (b >= prevEnd && b > k - 256 && isWs(text.charCodeAt(b))) b--;
    const afterDict = text.charCodeAt(b) === 62 && text.charCodeAt(b - 1) === 62;
    if (!afterDict && start < 0) continue; // the word "stream" in text
    // Ambiguous (a dictionary without a proper EOL, or a keyword-looking line without a plain
    // dictionary before it, e.g. after a comment): readers may still take it as a stream. Reject.
    if (!afterDict || start < 0) throw new Unscannable("ambiguous stream keyword");

    const dict = decodeNames(text.slice(prevEnd, k));
    const chain = filterChain(dict);
    checkDecodeParms(dict);
    const len = directLength(dict);
    let data;
    let end;
    if (len !== null) {
      // F-2: the declared length decides; an "endstream" inside it is just data.
      if (start + len > buf.length) throw new Unscannable("stream shorter than /Length");
      data = buf.subarray(start, start + len);
      end = text.indexOf("endstream", start + len);
      if (end < 0) throw new Unscannable("missing endstream");
    } else {
      end = text.indexOf("endstream", start);
      if (end < 0) throw new Unscannable("missing endstream");
      data = buf.subarray(start, end);
      // Without a direct /Length, compressed data truncated at an embedded "endstream" fails the
      // strict decoders below (Flate must reach its end; ASCIIHex/85 need their EOD marker).
    }
    prevEnd = end + 9;
    pos = prevEnd;

    const isObjStm = /\/Type[\s\0]*\/ObjStm(?![A-Za-z0-9])/.test(dict);
    let skip = false;
    for (const name of chain) {
      checkDeadline(deadline);
      const kind = FILTER_KIND[name];
      if (!kind) throw new Unscannable(`filter ${name}`);
      if (kind === "image") {
        if (isObjStm) throw new Unscannable("image filter on an object stream");
        skip = true;
        break;
      }
      try {
        if (kind === "flate") data = inflateSync(data, { maxOutputLength: Math.max(1, DECODE_BUDGET - total) });
        else if (kind === "hex") data = asciiHex(data);
        else data = ascii85(data, deadline);
      } catch (err) {
        if (err instanceof Unscannable && err.message === "time budget") throw err;
        throw new Unscannable(`decode ${name}`);
      }
      if (total + data.byteLength > DECODE_BUDGET) throw new Unscannable("size budget");
    }
    if (skip) continue;
    total += data.byteLength;
    if (total > DECODE_BUDGET) throw new Unscannable("size budget");
    out.push(data.toString("latin1"));
  }
  return out;
}

/** True when the PDF has active content, or when it can't be fully inspected (fail closed). */
export function pdfHasActiveContent(bytes, timeBudgetMs = SCAN_BUDGET_MS) {
  const deadline = Date.now() + timeBudgetMs;
  try {
    const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const text = buf.toString("latin1");
    const names = decodeNames(text);
    checkDeadline(deadline);
    if (PDF_ACTIVE.test(names) || ENCRYPT.test(names)) return true;
    for (const s of decodedStreams(buf, text, deadline)) {
      checkDeadline(deadline);
      const decoded = decodeNames(s);
      if (PDF_ACTIVE.test(decoded) || ENCRYPT.test(decoded)) return true;
    }
    return Date.now() > deadline;
  } catch {
    return true;
  }
}

/** Pure verdict on the bytes of an evidence file: signature, size, and the PDF heuristic. */
export function evidenceVerdict(bytes, mime, declaredSize, timeBudgetMs = SCAN_BUDGET_MS) {
  const magic = SIGNATURES[mime];
  if (!magic) return "rejected";
  if (bytes.byteLength === 0 || bytes.byteLength !== declaredSize || bytes.byteLength > MAX_BYTES) return "rejected";
  if (!magic.every((b, i) => bytes[i] === b)) return "rejected";
  if (mime === "application/pdf" && pdfHasActiveContent(bytes, timeBudgetMs)) return "rejected";
  return "clean";
}
