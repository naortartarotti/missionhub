# Security & privacy

> Draft engineering notes — **not legal advice**. Items marked ⚖️ require review by Canadian counsel.

## Tenant isolation (tested in `tests/integration`)
- RLS on every table; helpers `app.is_member/has_role` ignore suspended orgs and memberships.
- No cross-tenant policy on candidates/jobs/consents/documents. Raw `matches` and `background_jobs` have no policies.
- Job owners never receive a candidate id: the link lives in `referral_candidate_links` (source-only). They read an immutable snapshot of approved fields only.
- IDOR: ids in URLs are always re-resolved through RLS-scoped queries; RPCs re-check membership and side.
- Demo and real organizations can never be paired (DB trigger).

## Documents
- Private buckets; paths `{org}/{candidate}/{uuid}.ext`; storage RLS checks org membership and candidate ownership.
- Uploads: MIME/size allow-list, SHA-256, server-side signature check (PDF/ZIP magic), active-content heuristics, `scan_status` gate before sharing. ⚠️ Not a full AV — plug a ClamAV/commercial scanner into `scanDocument`.
- Referral documents are **copied** into a separate bucket; target access via 60-second signed URLs issued only after `authorize_referral_document` (audited). Revocation removes access and purges copies.

## Consent / authorization ⚖️
- Processing authorization required before matching; job- and recipient-specific sharing authorization required before submission. Upload ≠ permission to share.
- Records: legal basis, scope, evidence, dates, revocation (append-only). Revocation cuts partner access immediately.
- Data-subject requests logged with 30-day due dates; deletion via irreversible anonymization that preserves financial/audit history.

## Matching fairness
Engine input type excludes names, contact details, photos and protected characteristics (unit-tested). Scores are labelled indicative; humans decide. Language requirements are used only when the job lists them as required — review for proxy effects.

## Finance
No funds move through the platform. Ledger rows immutable; corrections are compensating entries. Recorder can never verify their own evidence; client payments verified by platform admins, payouts by the receiving recruiter. Idempotency keys on submissions, evidence and ledger entries.

## Platform admins
No RLS access to candidate data. Exceptional PII access must be an out-of-band, approved and logged procedure (not implemented in-app).

## Other controls
Security headers (`next.config.ts`), same-origin redirect guard, generic auth errors, Zod everywhere, CSV formula-injection guard, privacy-aware logs (ids/timings only), secrets only in env (`.env.example`).

## Open items ⚖️
PIPEDA / Alberta PIPA / Québec Law 25 applicability, cross-border transfers (AI/email vendors), CASL, candidate ownership & prior-presentation rules, exclusivity, replacement guarantees, sales tax (GST/HST/QST), invoicing, KYC, payout regulation, chargebacks. Use a Canadian Supabase region (`ca-central-1`). Rate limiting is currently Supabase Auth's built-in only; add app-level limits (e.g. Upstash) before launch.
