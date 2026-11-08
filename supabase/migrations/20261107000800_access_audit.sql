-- Audited access to private documents.

create or replace function public.audit_document_access(p_document uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d public.candidate_documents;
begin
  select * into d from public.candidate_documents where id = p_document and deleted_at is null;
  if not found or not app.is_member(d.organization_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app.audit(d.organization_id, 'document.accessed', 'candidate_document', d.id, '{}');
end $$;

-- Returns the referral-bucket path for a granted document after authorization; the server then
-- issues a short-lived signed URL. Revoked or not-yet-copied grants are refused.
create or replace function public.authorize_referral_document(p_grant uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  g public.referral_document_grants;
  r public.referrals;
begin
  select * into g from public.referral_document_grants where id = p_grant;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from public.referrals where id = g.referral_id;
  if not (app.is_member(r.source_org_id) or app.is_member(r.target_org_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if g.revoked_at is not null or r.sharing_revoked_at is not null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if g.status <> 'available' or g.storage_path is null then
    raise exception 'document_not_ready' using errcode = 'P0001';
  end if;
  perform app.audit(case when app.is_member(r.target_org_id) then r.target_org_id else r.source_org_id end,
    'referral_document.accessed', 'referral', r.id, jsonb_build_object('grant_id', g.id));
  return g.storage_path;
end $$;

revoke execute on function public.audit_document_access(uuid) from public, anon;
revoke execute on function public.authorize_referral_document(uuid) from public, anon;
grant execute on function public.audit_document_access(uuid) to authenticated;
grant execute on function public.authorize_referral_document(uuid) to authenticated;
