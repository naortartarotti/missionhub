alter table public.audit_events add constraint audit_events_actor_profile_fk foreign key (actor_id) references public.profiles (id) on delete set null;
