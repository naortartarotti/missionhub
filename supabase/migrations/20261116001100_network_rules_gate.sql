-- N10 part 2 of 8: the first-access gate in the database (BR-7, N10-D13).
--
-- A signed-in user with no member acceptance of any version can't write anything while a current
-- version exists. Enforced by construction rather than per RPC:
--   - a statement-level trigger on every client- or RPC-writable table (public schema, plus the app
--     tables member RPCs write directly) raises `rules_acceptance_required`. Triggers fire inside
--     SECURITY DEFINER RPCs too (auth.uid() is still the caller), so every writing RPC is gated
--     without editing its body, and so is every direct PostgREST insert / update / delete;
--   - the storage insert policies call app.assert_rules_gate().
-- Not gated (closed exempt list, BR-7 / BR-11):
--   - no signed-in user (anon candidate-token calls, service role, worker): auth.uid() is null;
--   - platform admins (BR-11: /admin needs no acceptance);
--   - calls that set the transaction-local flag `app.rules_gate_exempt` first: accept_network_rules,
--     create_organization (records the acceptance itself), accept_invitation (the gate starts once
--     the membership exists), the candidate-token RPCs (get_candidate_request,
--     respond_candidate_request: the actor is the candidate, not the signed-in user). PostgREST runs
--     one RPC per transaction and clients can't set custom GUCs, so the flag can't leak;
--   - tables outside the gate: notifications (marking one's own notifications read), audit_events,
--     background_jobs, matches (worker), app.rate_limits, and the acceptance tables (written only by
--     the exempt RPCs);
--   - no published version yet (nothing to accept; N10 is inert until v1 is published).
-- Reads before acceptance stay possible through PostgREST (residual R-7, security-and-privacy.md).

create or replace function app.rules_gate_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is null
      or coalesce(current_setting('app.rules_gate_exempt', true), '') = 'on'
      or app.is_platform_admin()
      or app.user_accepted_any(auth.uid())
      or app.rules_current_version() is null;
$$;

create or replace function app.assert_rules_gate() returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.rules_gate_ok() then
    raise exception 'rules_acceptance_required' using errcode = 'P0001';
  end if;
  return true;
end $$;

create or replace function app.enforce_rules_gate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.assert_rules_gate();
  return null;
end $$;

revoke execute on function app.rules_gate_ok(), app.enforce_rules_gate() from public, anon, authenticated;
revoke execute on function app.assert_rules_gate() from public, anon;
-- Storage policies evaluate it as the uploading user.
grant execute on function app.assert_rules_gate() to authenticated;

-- Attaches the gate trigger to a table (idempotent). Used here and by later N10 parts.
create or replace function app.attach_rules_gate(p_table regclass) returns void
language plpgsql set search_path = '' as $$
begin
  execute format('drop trigger if exists zz_rules_gate on %s', p_table);
  execute format('create trigger zz_rules_gate before insert or update or delete on %s '
                 'for each statement execute function app.enforce_rules_gate()', p_table);
end $$;
revoke execute on function app.attach_rules_gate(regclass) from public, anon, authenticated;

-- Every public base table except the exempt ones, plus the app tables member RPCs write directly.
do $$
declare
  t record;
begin
  for t in
    select c.oid::regclass as rel
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r', 'p') and n.nspname = 'public'
       and c.relname not in ('notifications', 'audit_events', 'background_jobs', 'matches',
                             'network_rules_versions', 'network_rules_version_texts',
                             'network_rules_org_acceptances', 'network_rules_member_acceptances')
    union all
    select x::regclass from unnest(array['app.referral_claims', 'app.referral_claim_files']) x
  loop
    perform app.attach_rules_gate(t.rel);
  end loop;
end $$;

-- Storage: every insert policy also requires the gate (the conduct-evidence policy, part 4, too).
drop policy if exists candidate_docs_insert on storage.objects;
create policy candidate_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'candidate-documents' and app.can_access_candidate_object(name) and app.assert_rules_gate());
drop policy if exists candidate_photos_insert on storage.objects;
create policy candidate_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'candidate-photos' and app.can_access_candidate_object(name) and app.assert_rules_gate());
drop policy if exists claim_evidence_insert on storage.objects;
create policy claim_evidence_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'claim-evidence' and app.can_upload_claim_evidence(name) and app.assert_rules_gate());

-- accept_invitation: exempt (latest body: 20261107000100_foundation.sql), plus the flag.
create or replace function public.accept_invitation(p_token text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.organization_invitations;
  v_email text;
  v_slug text;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  -- BR-7 exempt: the first-access gate starts once the membership exists.
  perform set_config('app.rules_gate_exempt', 'on', true);
  select email into v_email from public.profiles where id = auth.uid();
  select * into v_inv from public.organization_invitations
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
   for update;
  if not found or v_inv.status <> 'pending' then
    raise exception 'invitation_invalid' using errcode = 'P0002';
  end if;
  if v_inv.expires_at < now() then
    update public.organization_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'invitation_expired' using errcode = 'P0002';
  end if;
  if lower(v_inv.email) <> lower(v_email) then
    raise exception 'invitation_email_mismatch' using errcode = '42501';
  end if;
  insert into public.organization_memberships (organization_id, user_id, role)
  values (v_inv.organization_id, auth.uid(), v_inv.role)
  on conflict (organization_id, user_id) do update set status = 'active', role = excluded.role;
  update public.organization_invitations
     set status = 'accepted', accepted_by = auth.uid()
   where id = v_inv.id;
  perform app.audit(v_inv.organization_id, 'invitation.accepted', 'invitation', v_inv.id, '{}');
  select slug into v_slug from public.organizations where id = v_inv.organization_id;
  return v_slug;
end $$;
