-- Candidate confirmation: new referral statuses.
--
-- Kept in its own migration because Postgres cannot use a new enum value in the same
-- transaction that adds it (policies, inserts and casts in the next migration need them).
--
--   awaiting_candidate  the sourcing recruiter submitted the referral; the candidate has been
--                       emailed a private link and must confirm before the partner sees anything.
--   candidate_declined  the candidate refused through that link. Never visible to the partner.

alter type public.referral_status add value if not exists 'awaiting_candidate' before 'submitted';
alter type public.referral_status add value if not exists 'candidate_declined' after 'awaiting_candidate';
