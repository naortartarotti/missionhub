import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { evidenceVerdict, evidenceVerdictIsolated, pdfHasActiveContent, sha256Hex } from "../claim-evidence";

const bytes = (head: number[], extra = "body") => new Uint8Array([...head, ...new TextEncoder().encode(extra)]);
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPG = [0xff, 0xd8, 0xff, 0xe0];

describe("claim evidence verdict (N1, EC-4)", () => {
  it("accepts PDF, PNG and JPEG whose signature matches the declared type and size", () => {
    for (const [head, mime] of [[PDF, "application/pdf"], [PNG, "image/png"], [JPG, "image/jpeg"]] as const) {
      const b = bytes([...head]);
      expect(evidenceVerdict(b, mime, b.byteLength), mime).toBe("clean");
    }
  });

  it("rejects a signature mismatch, a size mismatch, other types and empty files", () => {
    const png = bytes(PNG);
    expect(evidenceVerdict(png, "application/pdf", png.byteLength)).toBe("rejected");
    expect(evidenceVerdict(png, "image/png", png.byteLength + 1)).toBe("rejected");
    expect(evidenceVerdict(png, "text/csv", png.byteLength)).toBe("rejected");
    expect(evidenceVerdict(new Uint8Array(), "image/png", 0)).toBe("rejected");
  });

  it("rejects PDFs with active content markers", () => {
    for (const marker of ["/JavaScript", "/Launch", "/EmbeddedFile", "/OpenAction"]) {
      const b = bytes(PDF, `1.7 << ${marker} (x) >>`);
      expect(evidenceVerdict(b, "application/pdf", b.byteLength), marker).toBe("rejected");
    }
  });

  it("hashes the stored bytes with SHA-256 (hex)", () => {
    const b = bytes(PDF);
    expect(sha256Hex(b)).toBe(createHash("sha256").update(b).digest("hex"));
    expect(sha256Hex(b)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("PDF active content (QA m-1)", () => {
  const pdfOf = (body: string) => new TextEncoder().encode(`%PDF-1.7\n${body}\n%%EOF\n`);
  it("allows plain links and ordinary names, rejects decoded escapes and /AA", () => {
    const link = pdfOf("1 0 obj << /Type /Annot /A << /S /URI /URI (https://example.com) >> /JSON 1 >> endobj");
    expect(evidenceVerdict(link, "application/pdf", link.byteLength)).toBe("clean");
    const aa = pdfOf("1 0 obj << /Type /Page /AA << >> >> endobj");
    expect(evidenceVerdict(aa, "application/pdf", aa.byteLength)).toBe("rejected");
    const esc = pdfOf("1 0 obj << /#4C#61unch (x) >> endobj");
    expect(evidenceVerdict(esc, "application/pdf", esc.byteLength)).toBe("rejected");
  });
});

describe("PDF Flate streams (QA r2-m1)", () => {
  const withStream = (payload: Buffer) => {
    const head = Buffer.from(`%PDF-1.7\n1 0 obj << /Filter /FlateDecode /Length ${payload.length} >>\nstream\n`, "latin1");
    return new Uint8Array(Buffer.concat([head, payload, Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1")]));
  };
  it("accepts a benign compressed stream and rejects one that can't be inflated", async () => {
    const { deflateSync } = await import("node:zlib");
    const ok = withStream(deflateSync(Buffer.from("BT /F1 12 Tf (Hello) Tj ET", "latin1")));
    expect(evidenceVerdict(ok, "application/pdf", ok.byteLength)).toBe("clean");
    const broken = withStream(Buffer.from("not zlib at all", "latin1"));
    expect(evidenceVerdict(broken, "application/pdf", broken.byteLength)).toBe("rejected");
  });
});

describe("PDF scanner fails closed and stays linear (QA round 3)", () => {
  const stream = (dict: string, body: Buffer) =>
    new Uint8Array(Buffer.concat([Buffer.from(`%PDF-1.7\n1 0 obj << ${dict} /Length ${body.length} >>\nstream\n`, "latin1"), body, Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1")]));
  const v = (b: Uint8Array) => evidenceVerdict(b, "application/pdf", b.byteLength);
  const active = Buffer.from("<< /OpenAction << /S /JavaScript >> >>", "latin1");

  it("decodes ASCII85 and chained filters, and rejects what it can't decode", async () => {
    const { deflateSync } = await import("node:zlib");
    const a85 = (buf: Buffer) => {
      let out = "";
      for (let i = 0; i < buf.length; i += 4) {
        const chunk = Buffer.concat([buf.subarray(i, i + 4), Buffer.alloc(4)]).subarray(0, 4);
        let n = chunk.readUInt32BE(0);
        const digits: string[] = [];
        for (let j = 0; j < 5; j++) { digits.unshift(String.fromCharCode((n % 85) + 33)); n = Math.floor(n / 85); }
        out += digits.join("").slice(0, Math.min(4, buf.length - i) + 1);
      }
      return Buffer.from(out + "~>", "latin1");
    };
    expect(v(stream("/Filter /ASCII85Decode", a85(active)))).toBe("rejected");
    expect(v(stream("/Filter [/ASCII85Decode /FlateDecode]", a85(deflateSync(active))))).toBe("rejected");
    expect(v(stream("/Filter [/ASCII85Decode /FlateDecode]", a85(deflateSync(Buffer.from("BT (hi) Tj ET")))))).toBe("clean");
    expect(v(stream("/Type /ObjStm /Filter /LZWDecode", Buffer.from("anything")))).toBe("rejected");
    expect(v(stream("/Type /ObjStm /Filter /DCTDecode", Buffer.from("anything")))).toBe("rejected");
    expect(v(stream("/Subtype /Image /Filter /DCTDecode", Buffer.from([0xff, 0xd8, 0xff, 0xe0])))).toBe("clean");
  });

  it("rejects encrypted files and a stream without endstream", () => {
    expect(v(new Uint8Array(Buffer.from("%PDF-1.7\ntrailer << /Encrypt 9 0 R >>\n%%EOF\n", "latin1")))).toBe("rejected");
    expect(v(new Uint8Array(Buffer.from("%PDF-1.7\n1 0 obj << /Length 4 >>\nstream\nabcd", "latin1")))).toBe("rejected");
  });

  it("scans 10 MB of many streams in well under the time budget, and a zero budget rejects", () => {
    const many = new Uint8Array(Buffer.from("%PDF-1.7\n" + "1 0 obj << /Length 1 >>\nstream\nx\nendstream\nendobj\n".repeat(200_000), "latin1"));
    const t = Date.now();
    expect(v(many)).toBe("clean");
    expect(Date.now() - t).toBeLessThan(1_500);
    expect(pdfHasActiveContent(many, -1)).toBe(true);
  });
});

describe("isolated scan in a worker thread (QA final F-1)", () => {
  const ab = (s: string | Buffer) => {
    const b = typeof s === "string" ? Buffer.from(s, "latin1") : s;
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };

  it("returns the same verdicts as the pure scan, and transfers (detaches) the buffer", async () => {
    const clean = ab("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
    const size = clean.byteLength;
    expect(await evidenceVerdictIsolated(clean, "application/pdf", size)).toBe("clean");
    expect(clean.byteLength).toBe(0); // transferred, not copied
    const bad = ab("%PDF-1.7\n1 0 obj << /OpenAction << /S /JavaScript >> >> endobj\n%%EOF\n");
    expect(await evidenceVerdictIsolated(bad, "application/pdf", bad.byteLength)).toBe("rejected");
  });

  it("rejects through the hard timeout: the thread is terminated, never accepted", async () => {
    // 10 MB of escaped names takes far longer than 20 ms; the in-scan budget is lifted so only the
    // parent's wall-clock timeout can end it.
    const big = ab("%PDF-1.7\n" + "/#41".repeat(2_500_000));
    const t = Date.now();
    expect(await evidenceVerdictIsolated(big, "application/pdf", big.byteLength, { timeoutMs: 20, scanBudgetMs: 600_000 })).toBe("rejected");
    expect(Date.now() - t).toBeLessThan(2_000);
  });

  it("rejects when the worker can't produce a verdict (bad input crashes the thread)", async () => {
    const empty = new ArrayBuffer(0);
    expect(await evidenceVerdictIsolated(empty, "application/pdf", 0)).toBe("rejected");
  });
});
