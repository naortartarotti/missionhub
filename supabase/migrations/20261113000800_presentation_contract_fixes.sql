-- N1 contract fixes after the frontend build (no change to applied migrations).
--
-- 1. file_prior_presentation_claim: the evidence-specific parameters get defaults. PostgREST
--    resolves functions by the JSON keys sent, so a caller omitting p_evidence_referral (file
--    evidence) or p_prior_process_date (referral evidence) got "function not found". Adding
--    defaults with CREATE OR REPLACE keeps the signature (and its grants). A null p_acting_org
--    keeps the membership check (any target-side membership), like the other side-resolving RPCs.
-- 2. list_claim_evidence_referrals: each option says whether its sharing was revoked (AC-31);
--    revoked referrals that still count remain valid evidence (PD-027).
-- 3. get_referral_dispute: business days left before "resolve by" (AC-43), so the admin card
--    doesn't recompute the calendar. Null once the dispute is closed or the date has passed.

create or replace function public.file_prior_presentation_claim(
  p_referral uuid,
  p_expected_version integer,
  p_evidence_kind text,
  p_file_ids uuid[],
  p_evidence_referral uuid default null,
  p_prior_process_date date default null,
  p_attested boolean default false,
  p_note text default null,
  p_acting_org uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  v_block text;
  v_delivered date;
  v_date date;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_claim uuid;
  v_deadline timestamptz;
  v_files integer;
begin
  r := app.target_referral(p_referral, p_acting_org, true);
  if r.version <> p_expected_version then raise exception 'stale_version' using errcode = 'P0001'; end if;
  v_block := app.claim_blocker(r.id);
  if v_block is not null then
    raise exception '%', v_block using errcode = 'P0001', detail = coalesce(app.iso_utc(r.claim_deadline_at), '');
  end if;
  if not coalesce(p_attested, false) then raise exception 'claim_attestation_required' using errcode = '22023'; end if;
  if v_note is not null and char_length(v_note) > 2000 then raise exception 'claim_note_too_long' using errcode = '22023'; end if;

  v_delivered := (r.delivered_at at time zone 'America/Toronto')::date;
  if p_evidence_kind = 'file' then
    if p_evidence_referral is not null then raise exception 'claim_evidence_invalid' using errcode = '22023'; end if;
    if coalesce(cardinality(p_file_ids), 0) not between 1 and 5 then
      raise exception 'claim_evidence_invalid' using errcode = '22023';
    end if;
    select count(*) into v_files from app.referral_claim_files f
     where f.id = any (p_file_ids) and f.referral_id = r.id and f.claim_id is null and f.removed_at is null;
    if v_files <> cardinality(p_file_ids) or v_files <> (select count(distinct x) from unnest(p_file_ids) x) then
      raise exception 'claim_evidence_invalid' using errcode = '22023';
    end if;
    if exists (select 1 from app.referral_claim_files f
                where f.id = any (p_file_ids) and (f.scan_status <> 'clean' or f.sha256 is null)) then
      raise exception 'claim_files_not_ready' using errcode = 'P0001';
    end if;
    v_date := p_prior_process_date;
    if v_date is null or v_date >= v_delivered or v_date < (v_delivered - interval '6 months')::date then
      raise exception 'claim_date_invalid' using errcode = '22023';
    end if;
  elsif p_evidence_kind = 'referral' then
    if coalesce(cardinality(p_file_ids), 0) > 0 or p_evidence_referral is null
       or not app.evidence_referral_ok(r.id, p_evidence_referral) then
      raise exception 'claim_referral_invalid' using errcode = 'P0001';
    end if;
    select (er.delivered_at at time zone 'America/Toronto')::date into v_date
      from public.referrals er where er.id = p_evidence_referral;
  else
    raise exception 'claim_evidence_invalid' using errcode = '22023';
  end if;

  v_deadline := app.add_business_days(now(), 10);
  insert into app.referral_claims (referral_id, source_org_id, target_org_id, filed_by, evidence_kind, evidence_referral_id,
                                   prior_process_date, attested_at, note, contest_deadline_at)
  values (r.id, r.source_org_id, r.target_org_id, auth.uid(), p_evidence_kind,
          case when p_evidence_kind = 'referral' then p_evidence_referral end, v_date, now(), v_note, v_deadline)
  returning id into v_claim;
  if p_evidence_kind = 'file' then
    update app.referral_claim_files set claim_id = v_claim where id = any (p_file_ids);
  end if;

  update public.referrals
     set status = 'declined', decline_reason = 'prior_presentation', decided_at = now(), version = version + 1
   where id = r.id;
  insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason)
  values (r.id, r.status, 'declined', auth.uid(), 'target', 'prior_presentation');

  perform app.notify_org(r.source_org_id, 'claim.filed', 'Prior-presentation objection on your referral',
    coalesce((select o.name from public.organizations o where o.id = r.target_org_id), 'The partner')
      || ' filed an objection on your referral of ' || r.candidate_label || '. You can contest it until '
      || to_char(v_deadline at time zone 'America/Toronto', 'FMMon FMDD, YYYY, FMHH12:MI AM') || ' ET.',
    '/referrals/' || r.id);
  perform app.audit(r.target_org_id, 'referral.claim_filed', 'referral', r.id,
    jsonb_build_object('evidence_kind', p_evidence_kind));
  return jsonb_build_object('claim_id', v_claim, 'version', r.version + 1, 'contest_deadline_at', v_deadline);
end $$;

create or replace function public.list_claim_evidence_referrals(p_referral uuid, p_acting_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
begin
  r := app.target_referral(p_referral, p_acting_org);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'referral_id', er.id, 'candidate_label', er.candidate_label, 'job_title', er.job_title_snapshot,
             'source_org_name', o.name, 'delivered_at', er.delivered_at, 'status', er.status,
             'revoked', er.sharing_revoked_at is not null)
           order by er.delivered_at desc)
      from public.referrals er
      join public.organizations o on o.id = er.source_org_id
     where er.target_org_id = r.target_org_id
       and er.delivered_at is not null and er.delivered_at < r.delivered_at
       and app.evidence_referral_ok(r.id, er.id)), '[]'::jsonb);
end $$;

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
                                  'resolve_by', app.add_business_days(d.created_at, 5),
                                  'resolve_by_business_days_left', case when d.status = 'open'
                                    then app.business_days_left(app.add_business_days(d.created_at, 5)) end),
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
