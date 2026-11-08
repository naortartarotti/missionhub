-- Private storage. No public buckets.
-- candidate-documents: path = {organization_id}/{candidate_id}/{uuid}.{ext}; members of that org only.
-- referral-documents:  path = {referral_id}/{grant_id}.{ext}; NO end-user policies. Files are served
--   only via short-lived signed URLs issued by the server after an authorization check.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('candidate-documents', 'candidate-documents', false, 10485760,
    array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('referral-documents', 'referral-documents', false, 10485760,
    array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

create policy candidate_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'candidate-documents' and app.is_member(((storage.foldername(name))[1])::uuid));
create policy candidate_docs_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'candidate-documents'
    and app.is_member(((storage.foldername(name))[1])::uuid)
    and exists (
      select 1 from public.candidates c
      where c.id = ((storage.foldername(name))[2])::uuid
        and c.organization_id = ((storage.foldername(name))[1])::uuid
    )
  );
-- No update/delete policies: documents are soft-deleted in candidate_documents and purged by the worker.
