-- Rebrand: MissionHub -> Workatent.
-- Earlier migrations were edited in place for fresh databases; this one brings already-migrated
-- databases in line: it rewrites every app/public function whose body still names the old brand,
-- and moves existing API connections to the new provider id. Past notifications keep their text.

do $$
declare
  f record;
begin
  for f in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('app', 'public')
       and p.prokind in ('f', 'p')
       and p.prosrc ~* 'missionhub'
  loop
    execute replace(replace(replace(pg_get_functiondef(f.oid),
      'MissionHub', 'Workatent'), 'missionhub', 'workatent'), 'MISSIONHUB', 'WORKATENT');
  end loop;
end $$;

update public.connections set provider = 'workatent_api' where provider = 'missionhub_api';
