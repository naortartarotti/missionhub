-- AI-derived skill relations for semantic matching ("react" is implied by "next.js").
--
-- One row per requirement skill, holding the skills whose holders can be credited for it.
-- Built from skill NAMES only (never candidate or job data), so it is global and contains no
-- personal data. Written and read only by the background worker (service role): RLS on, no policies.

create table public.skill_relations (
  skill       text primary key check (char_length(skill) between 1 and 80),
  related     text[] not null default '{}' check (cardinality(related) <= 30),
  model       text not null,
  created_at  timestamptz not null default now()
);

create index skill_relations_related_gin on public.skill_relations using gin (related);

alter table public.skill_relations enable row level security;
revoke all on public.skill_relations from anon, authenticated;
