-- N3 drop 1 (docs/specs/referral-claims-two-sided-hire/backend.md v1), BR-31: a placement can exist
-- without fee details. Own file: a new enum value can't be used in the transaction that adds it.
alter type public.placement_status add value if not exists 'fee_pending' before 'hire_reported';
