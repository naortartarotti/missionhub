import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { fileClaimRpcArgs, fileClaimSchema } from "../schemas";

const KEYS = ["p_acting_org", "p_attested", "p_evidence_kind", "p_evidence_referral", "p_expected_version", "p_file_ids", "p_note", "p_prior_process_date", "p_referral"];

describe("fileClaim RPC arguments (PostgREST resolves by key)", () => {
  it.each([
    ["file", { evidenceKind: "file", fileIds: [randomUUID()], priorProcessDate: "2026-10-01" }],
    ["referral", { evidenceKind: "referral", evidenceReferralId: randomUUID() }],
  ])("keeps every key after JSON serialisation for %s evidence", (_, extra) => {
    const v = fileClaimSchema.parse({ referralId: randomUUID(), version: 2, attested: true, ...extra });
    const sent = JSON.parse(JSON.stringify(fileClaimRpcArgs(v, randomUUID())));
    expect(Object.keys(sent).sort()).toEqual(KEYS);
    if (v.evidenceKind === "file") expect(sent.p_evidence_referral).toBeNull();
    else expect(sent.p_prior_process_date).toBeNull();
  });
});
