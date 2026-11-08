-- Allow PostgREST to embed owner display names (profiles.id = auth.users.id).
alter table public.candidates add constraint candidates_owner_profile_fk foreign key (owner_id) references public.profiles (id);
alter table public.jobs add constraint jobs_owner_profile_fk foreign key (owner_id) references public.profiles (id);
alter table public.organization_memberships add constraint memberships_user_profile_fk foreign key (user_id) references public.profiles (id) on delete cascade;
