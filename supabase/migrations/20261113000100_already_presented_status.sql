-- N1 duplicate and prior-presentation protection, part 1 of 7.
-- A referral that loses the delivery race (BR-8) closes as `already_presented`. A new enum value
-- can't be used in the transaction that adds it, so it lives in its own migration.
alter type public.referral_status add value if not exists 'already_presented';
