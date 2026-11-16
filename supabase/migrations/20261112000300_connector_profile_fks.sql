-- PostgREST embeds go through foreign keys; these let the connectors and API-keys screens show
-- the owner's / creator's name (same pattern as 20261107000900_profile_fks).
alter table public.connections
  add constraint connections_owner_profile_fk foreign key (owner_id) references public.profiles (id);
alter table public.api_keys
  add constraint api_keys_creator_profile_fk foreign key (created_by) references public.profiles (id);
