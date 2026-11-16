import { createHash } from "node:crypto";
import { normalizeRulesText } from "./domain";

/** SHA-256 (hex) of the normalized UTF-8 text: equals network_rules_version_texts.sha256. Node only (kept out of domain.ts so client forms can import the schemas). */
export function rulesSha256(text: string): string {
  return createHash("sha256").update(normalizeRulesText(text), "utf8").digest("hex");
}
