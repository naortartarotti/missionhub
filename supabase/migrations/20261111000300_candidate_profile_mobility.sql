-- Candidate profile: photo, LinkedIn, postal code, and mobility for international roles
-- (travel, relocation scope, passports, work authorization).
--
-- Privacy: passports and work authorization are recorded only to answer "can this person take a role
-- abroad?". They are visible to the owning organization only, are NOT used by the matching engine, and
-- are never part of a shared referral snapshot unless that is added explicitly later.

alter table public.candidates
  add column photo_path text check (char_length(photo_path) <= 300),
  add column linkedin_url text check (char_length(linkedin_url) <= 300),
  add column postal_code text check (char_length(postal_code) <= 20),
  add column travel_availability text check (travel_availability in ('none', 'occasional', 'frequent')),
  add column relocation_scope text check (relocation_scope in ('none', 'region', 'country', 'international')),
  add column relocation_destinations text[] not null default '{}',
  add column has_passport boolean,
  add column passport_countries text[] not null default '{}',
  add column work_authorization text[] not null default '{}',
  add constraint candidates_mobility_list_sizes check (
    cardinality(relocation_destinations) <= 30 and cardinality(passport_countries) <= 10 and cardinality(work_authorization) <= 30
  );

-- Existing "open to relocation" candidates keep that meaning (somewhere else in their country).
update public.candidates set relocation_scope = 'country' where open_to_relocation and relocation_scope is null;

-- Photos: private bucket, path = {organization_id}/{candidate_id}/{uuid}.{ext}. Served through the app
-- after an authorization check, never by public URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('candidate-photos', 'candidate-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy candidate_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'candidate-photos' and app.is_member(((storage.foldername(name))[1])::uuid));
create policy candidate_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'candidate-photos'
    and app.has_role(((storage.foldername(name))[1])::uuid, array['org_admin','recruiter_manager','recruiter']::public.membership_role[])
    and exists (
      select 1 from public.candidates c
      where c.id = ((storage.foldername(name))[2])::uuid
        and c.organization_id = ((storage.foldername(name))[1])::uuid
    )
  );
-- Replacing or removing a photo deletes the old file.
create policy candidate_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'candidate-photos'
    and app.has_role(((storage.foldername(name))[1])::uuid, array['org_admin','recruiter_manager','recruiter']::public.membership_role[])
  );

-- Anonymization also clears the new personal fields (the photo file is removed by the app first).
create or replace function public.anonymize_candidate(p_candidate uuid, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.candidates where id = p_candidate;
  if v_org is null or not app.has_role(v_org, array['org_admin','recruiter_manager']::public.membership_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.candidates set
    full_name = 'Anonymized candidate', email = null, phone = null, headline = null, summary = null,
    notes = null, location_city = null, tags = '{}', status = 'deleted', anonymized_at = now(),
    photo_path = null, linkedin_url = null, postal_code = null, has_passport = null,
    passport_countries = '{}', work_authorization = '{}', relocation_destinations = '{}'
  where id = p_candidate;
  delete from public.candidate_experiences where candidate_id = p_candidate;
  update public.candidate_documents set deleted_at = now(), extracted_text = null where candidate_id = p_candidate;
  update public.candidate_consents set revoked_at = now(), revoked_reason = 'candidate anonymized'
   where candidate_id = p_candidate and revoked_at is null;
  perform app.audit(v_org, 'candidate.anonymized', 'candidate', p_candidate, jsonb_build_object('reason', left(p_reason, 200)));
end $$;
revoke execute on function public.anonymize_candidate(uuid, text) from public, anon;
grant execute on function public.anonymize_candidate(uuid, text) to authenticated;
