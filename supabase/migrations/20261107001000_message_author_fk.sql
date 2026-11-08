alter table public.referral_messages add constraint referral_messages_author_profile_fk foreign key (author_id) references public.profiles (id);
