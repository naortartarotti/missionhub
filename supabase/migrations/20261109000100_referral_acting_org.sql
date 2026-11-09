-- Resolve the caller's side of a referral from the workspace they are acting in.
--
-- app.referral_side() checks the source org first, so a user who belongs to BOTH the sourcing
-- and the hiring org was always treated as "source". Declining / accepting from the hiring
-- workspace then failed with `invalid_transition: submitted -> declined by source`, bulk decline
-- silently skipped those referrals, and replying from the hiring side failed the messages RLS check.
--
-- Fix: the RPCs take the acting org (the workspace the request comes from). When it is omitted
-- and the caller belongs to both sides, the side is inferred from the transition being requested
-- (no (from, to) pair is allowed for both sides).

create or replace function app.acting_side(p_referral uuid, p_acting_org uuid) returns public.referral_side
language sql stable security definer set search_path = '' as $$
  select case
    when p_acting_org is null or not app.is_member(p_acting_org) then null
    when p_acting_org = r.source_org_id then 'source'::public.referral_side
    when p_acting_org = r.target_org_id then 'target'::public.referral_side
  end
  from public.referrals r where r.id = p_referral;
$$;
revoke execute on function app.acting_side(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
drop function public.decline_pending_for_job(uuid);
drop function public.decline_referrals(uuid[], text, text);
drop function public.review_referral(uuid, public.referral_status, text, text, integer);
drop function public.transition_referral(uuid, public.referral_status, text, integer);

create function public.transition_referral(
  p_referral uuid, p_to public.referral_status, p_reason text, p_expected_version integer,
  p_acting_org uuid default null
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r public.referrals;
  t public.referral_transitions;
  v_side public.referral_side;
  v_other uuid;
begin
  select * into r from public.referrals where id = p_referral for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if p_acting_org is not null then
    v_side := app.acting_side(p_referral, p_acting_org);
  elsif app.is_member(r.source_org_id) and app.is_member(r.target_org_id) then
    select actor_side into v_side from public.referral_transitions
     where from_status = r.status and to_status = p_to;
    v_side := coalesce(v_side, 'source');
  else
    v_side := app.referral_side(p_referral);
  end if;
  if v_side is null then raise exception 'forbidden' using errcode = '42501'; end if;

  if r.version <> p_expected_version then
    raise exception 'stale_version' using errcode = 'P0001';
  end if;

  select * into t from public.referral_transitions
   where from_status = r.status and to_status = p_to and actor_side = v_side;
  if not found then
    raise exception 'invalid_transition: % -> % by %', r.status, p_to, v_side using errcode = 'P0001';
  end if;
  if t.requires_reason and coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if t.requires_active_agreement and not exists (
    select 1 from public.collaboration_agreements a where a.referral_id = r.id and a.status = 'active'
  ) then
    raise exception 'agreement_required' using errcode = 'P0001';
  end if;

  update public.referrals
     set status = p_to, version = version + 1,
         decided_at = case when p_to in ('accepted', 'declined') then now() else decided_at end
   where id = r.id;

  insert into public.referral_status_events (referral_id, from_status, to_status, actor_id, actor_side, reason)
  values (r.id, r.status, p_to, auth.uid(), v_side, left(p_reason, 2000));

  -- Accepting creates the collaboration agreement from the current default commission rule.
  if p_to = 'accepted' then
    perform app.create_agreement_for_referral(r.id);
  end if;

  v_other := case when v_side = 'source' then r.target_org_id else r.source_org_id end;
  perform app.notify_org(v_other, 'referral.status', 'Referral update: ' || replace(p_to::text, '_', ' '),
    r.job_title_snapshot || ' — ' || r.candidate_label, '/referrals/' || r.id);
  perform app.audit(case when v_side = 'source' then r.source_org_id else r.target_org_id end,
    'referral.transition', 'referral', r.id, jsonb_build_object('from', r.status, 'to', p_to));
  return r.version + 1;
end $$;

create function public.review_referral(
  p_referral uuid, p_to public.referral_status, p_reason_code text, p_note text, p_expected_version integer,
  p_acting_org uuid default null
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_version integer;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_to = 'declined' then
    if p_reason_code is null or p_reason_code not in
       ('salary', 'skills', 'seniority', 'location', 'availability', 'duplicate', 'position_filled', 'other') then
      raise exception 'reason_required' using errcode = '22023';
    end if;
    if p_reason_code = 'other' and v_note is null then
      raise exception 'reason_required' using errcode = '22023';
    end if;
  end if;
  -- The event keeps the note when there is one, otherwise the code (rendered as a label in the UI).
  v_version := public.transition_referral(p_referral, p_to, coalesce(v_note, nullif(p_reason_code, '')), p_expected_version, p_acting_org);
  if p_to = 'declined' then
    update public.referrals set decline_reason = p_reason_code where id = p_referral;
  end if;
  return v_version;
end $$;

-- Bulk decline for the job owner. Skips referrals that moved on or aren't the caller's; returns the count declined.
create function public.decline_referrals(p_ids uuid[], p_reason_code text, p_note text default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n integer := 0;
begin
  if cardinality(p_ids) > 200 then raise exception 'too_many' using errcode = '22023'; end if;
  for r in
    select id, version, target_org_id from public.referrals
     where id = any (p_ids) and status in ('submitted', 'under_review', 'info_requested')
       and app.is_member(target_org_id)
  loop
    begin
      -- Always as the hiring side: the row was selected because the caller is a member of it.
      perform public.review_referral(r.id, 'declined', p_reason_code, p_note, r.version, r.target_org_id);
      n := n + 1;
    exception when others then
      if sqlstate = '22023' then raise; end if; -- invalid reason: fail the whole batch
      -- stale version / concurrent change: skip this one
    end;
  end loop;
  return n;
end $$;

-- When a job is filled or closed, release every partner still waiting on a decision.
create function public.decline_pending_for_job(p_job uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_ids uuid[];
begin
  select organization_id into v_org from public.jobs where id = p_job;
  if v_org is null or not app.is_member(v_org) then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(array_agg(id), '{}') into v_ids from public.referrals
   where job_id = p_job and target_org_id = v_org and status in ('submitted', 'under_review', 'info_requested');
  if cardinality(v_ids) = 0 then return 0; end if;
  return public.decline_referrals(v_ids, 'position_filled', null);
end $$;

revoke execute on function public.transition_referral(uuid, public.referral_status, text, integer, uuid) from public, anon;
revoke execute on function public.review_referral(uuid, public.referral_status, text, text, integer, uuid) from public, anon;
revoke execute on function public.decline_referrals(uuid[], text, text) from public, anon;
revoke execute on function public.decline_pending_for_job(uuid) from public, anon;
grant execute on function public.transition_referral(uuid, public.referral_status, text, integer, uuid) to authenticated;
grant execute on function public.review_referral(uuid, public.referral_status, text, text, integer, uuid) to authenticated;
grant execute on function public.decline_referrals(uuid[], text, text) to authenticated;
grant execute on function public.decline_pending_for_job(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Messages: the author must belong to the org of the side they post as (not "the first side
-- app.referral_side finds"), so a member of both orgs can reply from either workspace.
drop policy referral_messages_insert on public.referral_messages;
create policy referral_messages_insert on public.referral_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.referrals r
       where r.id = referral_id
         and app.is_member(case when author_side = 'source' then r.source_org_id else r.target_org_id end)
    )
  );
