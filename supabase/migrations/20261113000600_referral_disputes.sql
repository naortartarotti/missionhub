-- N1 part 6 of 7: referral-level disputes (BR-16, BR-18, EC-8, PD-024).
--
-- `disputes` now has a kind: 'placement' (unchanged behaviour) or 'prior_presentation' (a contest
-- of a claim, opened by the sourcing side). One open dispute per referral. The contest reason is
-- readable by platform admins and by the contesting org only, never by the hiring side (PD-027).

-- The disputes columns themselves are added in 20261113000300 (functions there read them).

drop policy disputes_select on public.disputes;
create policy disputes_select on public.disputes for select to authenticated
  using (
    (kind = 'placement' and app.can_see_placement(placement_id))
    or (kind = 'prior_presentation' and (app.is_platform_admin() or app.is_member(opened_by_org)))
  );

-- Fingerprint deletion on anonymisation (defined in 20261113000300) needs disputes.referral_id.
create trigger candidates_anonymized_fingerprints after update of anonymized_at on public.candidates
  for each row when (old.anonymized_at is null and new.anonymized_at is not null)
  execute function app.on_candidate_anonymized();

-- Placement disputes only; prior-presentation disputes use resolve_prior_presentation_dispute.
create or replace function public.resolve_dispute(p_dispute uuid, p_resolution text, p_upheld boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d public.disputes;
  v_prev public.placement_status;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into d from public.disputes where id = p_dispute for update;
  if not found or d.status <> 'open' then raise exception 'dispute_not_open' using errcode = 'P0001'; end if;
  if d.kind <> 'placement' then raise exception 'invalid_dispute_kind' using errcode = 'P0001'; end if;
  update public.disputes set status = case when p_upheld then 'resolved' else 'rejected' end,
    resolution = p_resolution, resolved_by = auth.uid(), resolved_at = now() where id = d.id;
  select status_before_dispute into v_prev from public.placements where id = d.placement_id;
  perform app.placement_transition(d.placement_id, coalesce(v_prev, 'hire_reported'), 'Dispute closed: ' || left(p_resolution, 200));
  perform app.audit(null, 'dispute.resolved', 'dispute', d.id, jsonb_build_object('upheld', p_upheld));
end $$;

-- ---------------------------------------------------------------------------
-- Contest (sourcing side, before contest_deadline_at)
-- ---------------------------------------------------------------------------
create or replace function public.contest_prior_presentation_claim(p_referral uuid, p_reason text, p_acting_org uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  c app.referral_claims;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_id uuid;
begin
  r := app.source_referral(p_referral, p_acting_org, true);
  select * into c from app.referral_claims where referral_id = r.id for update;
  if not found then raise exception 'claim_not_allowed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.disputes d where d.referral_id = r.id and d.status = 'open') then
    raise exception 'dispute_already_open' using errcode = 'P0001';
  end if;
  if c.status = 'open' and now() >= c.contest_deadline_at then
    raise exception 'contest_window_closed' using errcode = 'P0001', detail = app.iso_utc(c.contest_deadline_at);
  end if;
  if c.status <> 'open' then raise exception 'claim_not_allowed' using errcode = 'P0001'; end if;
  if char_length(v_reason) not between 5 and 2000 then raise exception 'reason_required' using errcode = '22023'; end if;

  insert into public.disputes (kind, referral_id, claim_id, opened_by, opened_by_org, reason)
  values ('prior_presentation', r.id, c.id, auth.uid(), r.source_org_id, v_reason)
  returning id into v_id;
  update app.referral_claims set status = 'contested', contested_at = now() where id = c.id;

  perform app.notify_org(r.target_org_id, 'dispute.opened', 'Objection contested',
    'A platform admin is reviewing the prior-presentation objection on ' || r.candidate_label || '.', '/referrals/' || r.id);
  perform app.notify_org(r.source_org_id, 'dispute.opened', 'Objection contested',
    'A platform admin is reviewing the prior-presentation objection on ' || r.candidate_label || '.', '/referrals/' || r.id);
  perform app.audit(r.source_org_id, 'referral.claim_contested', 'referral', r.id, jsonb_build_object('dispute_id', v_id));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Admin resolution (BR-18). p_claim_upheld = true: claim valid (decline stands, referral stops
-- counting, flagged for N3). false: claim invalid (back to `submitted`, flagged "claim rejected",
-- fresh review clock, no second claim). Ownership date unchanged either way.
-- Dispute status follows the contest: claim upheld -> 'rejected' contest; claim rejected -> 'resolved'.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_prior_presentation_dispute(p_dispute uuid, p_claim_upheld boolean, p_resolution text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  d public.disputes;
  r public.referrals;
  v_res text := btrim(coalesce(p_resolution, ''));
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_claim_upheld is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  if char_length(v_res) not between 5 and 2000 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into d from public.disputes where id = p_dispute for update;
  if not found or d.status <> 'open' then raise exception 'dispute_not_open' using errcode = 'P0001'; end if;
  if d.kind <> 'prior_presentation' then raise exception 'invalid_dispute_kind' using errcode = 'P0001'; end if;
  select * into r from public.referrals where id = d.referral_id for update;

  update public.disputes
     set status = case when p_claim_upheld then 'rejected' else 'resolved' end,
         outcome = case when p_claim_upheld then 'claim_upheld' else 'claim_rejected' end,
         resolution = v_res, resolved_by = auth.uid(), resolved_at = now()
   where id = d.id;
  update app.referral_claims
     set status = case when p_claim_upheld then 'upheld' else 'rejected' end, resolved_at = now(), resolution = v_res
   where id = d.claim_id;

  if p_claim_upheld then
    update app.referral_presentations set void_reason = 'prior_presentation_upheld', voided_at = now()
     where referral_id = r.id and void_reason is null;
    perform app.notify_org(r.target_org_id, 'dispute.resolved', 'Objection upheld',
      'Read the platform admin''s resolution on the referral.', '/referrals/' || r.id);
    perform app.notify_org(r.source_org_id, 'dispute.resolved', 'Objection upheld',
      'Read the platform admin''s resolution on the referral.', '/referrals/' || r.id);
  else
    -- EC-8: back to `submitted` outside the transitions table; clears decline fields, writes a
    -- status event and bumps version so stale-version checks keep working.
    update public.referrals
       set status = 'submitted', decline_reason = null, decided_at = null, version = version + 1,
           claim_rejected_at = now(), review_clock_started_at = now()
     where id = r.id;
    insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason, actor_kind)
    values (r.id, r.status, 'submitted', auth.uid(), null, 'claim_rejected', 'admin');
    perform app.notify_org(r.target_org_id, 'dispute.resolved', 'Objection rejected',
      'Read the platform admin''s resolution on the referral.', '/referrals/' || r.id);
    perform app.notify_org(r.source_org_id, 'dispute.resolved', 'Objection rejected',
      'Read the platform admin''s resolution on the referral.', '/referrals/' || r.id);
  end if;
  perform app.audit(null, 'dispute.resolved', 'dispute', d.id,
    jsonb_build_object('kind', 'prior_presentation', 'claim_upheld', p_claim_upheld));
  perform app.audit(r.target_org_id, 'referral.claim_resolved', 'referral', r.id, jsonb_build_object('claim_upheld', p_claim_upheld));
  perform app.audit(r.source_org_id, 'referral.claim_resolved', 'referral', r.id, jsonb_build_object('claim_upheld', p_claim_upheld));
end $$;

-- ---------------------------------------------------------------------------
-- Admin read model of a prior-presentation dispute. No candidate name or label (PD-024).
-- ---------------------------------------------------------------------------
create or replace function app.admin_referral_card(p_referral uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'referral_id', r.id,
    'source_org', jsonb_build_object('id', so.id, 'name', so.name, 'locale', so.locale),
    'target_org', jsonb_build_object('id', tg.id, 'name', tg.name, 'locale', tg.locale),
    'job_id', r.job_id,
    'job_title', r.job_title_snapshot,
    'client_name', j.client_name,
    'internal', r.internal,
    'status', r.status,
    'delivered_at', r.delivered_at,
    'claim_deadline_at', r.claim_deadline_at,
    'ownership_protected_until', r.ownership_protected_until,
    'released_at', p.released_at,
    'void_reason', p.void_reason,
    'still_counts', app.presentation_counts(r.id))
  from public.referrals r
  join public.organizations so on so.id = r.source_org_id
  join public.organizations tg on tg.id = r.target_org_id
  left join public.jobs j on j.id = r.job_id
  left join app.referral_presentations p on p.referral_id = r.id
  where r.id = p_referral;
$$;

create or replace function public.get_referral_dispute(p_dispute uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d public.disputes;
  c app.referral_claims;
  rp app.referral_presentations;
  ep app.referral_presentations;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into d from public.disputes where id = p_dispute;
  if not found or d.kind <> 'prior_presentation' then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into c from app.referral_claims where id = d.claim_id;
  select * into rp from app.referral_presentations where referral_id = c.referral_id;
  if c.evidence_referral_id is not null then
    select * into ep from app.referral_presentations where referral_id = c.evidence_referral_id;
  end if;
  return jsonb_build_object(
    'dispute', jsonb_build_object('id', d.id, 'status', d.status, 'outcome', d.outcome, 'reason', d.reason,
                                  'resolution', d.resolution, 'created_at', d.created_at, 'resolved_at', d.resolved_at,
                                  'resolve_by', app.add_business_days(d.created_at, 5)),
    'claim', jsonb_build_object(
      'id', c.id, 'status', app.claim_effective_status(c.status, c.contest_deadline_at), 'filed_at', c.filed_at,
      'prior_process_date', c.prior_process_date, 'evidence_kind', c.evidence_kind, 'note', c.note,
      'contest_deadline_at', c.contest_deadline_at, 'contested_at', c.contested_at,
      'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'file_name', f.file_name, 'mime_type', f.mime_type,
                                                            'size_bytes', f.size_bytes, 'uploaded_at', f.uploaded_at,
                                                            'sha256', f.sha256, 'scan_status', f.scan_status)
                                          order by f.uploaded_at, f.id)
                           from app.referral_claim_files f where f.claim_id = c.id), '[]'::jsonb)),
    'claimed_referral', app.admin_referral_card(c.referral_id),
    'evidence_referral', case when c.evidence_referral_id is not null then app.admin_referral_card(c.evidence_referral_id) end,
    'same_client_key', case when c.evidence_referral_id is not null
                            then rp.client_key is not null and rp.client_key = ep.client_key end
  );
end $$;

-- "Same person" signal (PD-024): for referral-evidence disputes only, compares the two referrals'
-- stored fingerprints per channel. Returns match / no_match / not_available; never values or
-- hashes. Audited (admin, dispute id).
create or replace function public.compare_dispute_contacts(p_dispute uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d public.disputes;
  c app.referral_claims;
  v_out jsonb := '{}';
  k text;
  a bytea;
  b bytea;
begin
  if not app.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into d from public.disputes where id = p_dispute;
  if not found or d.kind <> 'prior_presentation' then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into c from app.referral_claims where id = d.claim_id;
  if c.evidence_kind <> 'referral' or c.evidence_referral_id is null then
    raise exception 'invalid_dispute_kind' using errcode = 'P0001';
  end if;
  foreach k in array array['email', 'phone', 'linkedin'] loop
    select f.hash into a from app.referral_fingerprints f where f.referral_id = c.referral_id and f.kind = k;
    if not found then a := null; end if;
    select f.hash into b from app.referral_fingerprints f where f.referral_id = c.evidence_referral_id and f.kind = k;
    if not found then b := null; end if;
    v_out := v_out || jsonb_build_object(k, case when a is null or b is null then 'not_available'
                                                 when a = b then 'match' else 'no_match' end);
  end loop;
  perform app.audit(null, 'dispute.contacts_compared', 'dispute', d.id, '{}');
  return v_out;
end $$;

revoke execute on function app.admin_referral_card(uuid) from public, anon, authenticated;
revoke execute on function
  public.contest_prior_presentation_claim(uuid, text, uuid), public.resolve_prior_presentation_dispute(uuid, boolean, text),
  public.get_referral_dispute(uuid), public.compare_dispute_contacts(uuid)
from public, anon;
grant execute on function
  public.contest_prior_presentation_claim(uuid, text, uuid), public.resolve_prior_presentation_dispute(uuid, boolean, text),
  public.get_referral_dispute(uuid), public.compare_dispute_contacts(uuid)
to authenticated;
