-- Every uploaded candidate document goes through the controlled scan/extract pipeline
-- before it can be shared (submit_referral requires scan_status = 'clean').
create or replace function app.on_document_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.enqueue('document.scan', new.id::text, jsonb_build_object('document_id', new.id));
  return new;
end $$;
create trigger candidate_documents_enqueue_scan after insert on public.candidate_documents
  for each row execute function app.on_document_insert();
