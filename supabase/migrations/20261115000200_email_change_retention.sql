-- N9 QA m-1: app.candidate_email_changes retention.
--
-- Before: rows were pruned only on the candidate's next email change, and anonymize_candidate
-- (email -> null) *added* a row that nothing ever removed.
-- Now:
--   * Anonymization deletes every row of the candidate and writes none. Done in the trigger, so it
--     holds for any path that sets anonymized_at together with the email change (anonymize_candidate
--     does both in one UPDATE).
--   * The 10-minute maintenance sweep (purge_presentation_data, worker runPresentationMaintenance)
--     deletes rows older than 60 days (30-day evidence window + 30-day maximum link TTL).

create or replace function app.on_candidate_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.anonymized_at is not null then
    delete from app.candidate_email_changes where candidate_id = new.id;
    return new;
  end if;
  delete from app.candidate_email_changes
   where candidate_id = new.id and changed_at < now() - interval '60 days';
  insert into app.candidate_email_changes (candidate_id) values (new.id);
  return new;
end $$;
revoke execute on function app.on_candidate_email_change() from public, anon, authenticated;

-- Body copied from 20261113001000 (PD-032); the N9 change is marked.
create or replace function public.purge_presentation_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_fp integer;
  v_sticky integer;
  v_email integer;
begin
  delete from app.referral_fingerprints f
   using public.referrals r
   where r.id = f.referral_id
     and (r.ownership_protected_until <= now()
          or r.status in ('candidate_declined', 'already_presented')
          or (r.delivered_at is null and r.status <> 'awaiting_candidate')
          -- PD-032: awaiting the candidate on an expired link (a resend recomputes them).
          or (r.status = 'awaiting_candidate' and exists (
                select 1 from public.referral_candidate_requests q where q.referral_id = r.id and q.expires_at < now())))
     and not exists (select 1 from public.disputes d where d.referral_id = r.id and d.status = 'open');
  get diagnostics v_fp = row_count;
  delete from app.sticky_stops where expires_at <= now();
  get diagnostics v_sticky = row_count;
  -- N9 m-1: BR-12 email-change dates are kept 60 days at most.
  delete from app.candidate_email_changes where changed_at < now() - interval '60 days';
  get diagnostics v_email = row_count;
  return jsonb_build_object('fingerprints', v_fp, 'sticky_stops', v_sticky, 'email_changes', v_email);
end $$;
-- Grants unchanged (service_role only, 20261113000700); restated for clarity.
revoke execute on function public.purge_presentation_data() from public, anon, authenticated;
grant execute on function public.purge_presentation_data() to service_role;

-- One-off cleanup of rows already left behind (anonymized candidates, or older than 60 days).
delete from app.candidate_email_changes e
 using public.candidates c
 where c.id = e.candidate_id and c.anonymized_at is not null;
delete from app.candidate_email_changes where changed_at < now() - interval '60 days';
