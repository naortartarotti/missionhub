-- N1 part 2 of 7: network business-day calendar (BR-17, BR-28, PD-015, PD-019). Shared with N4.
--
-- Business days = Monday to Friday in America/Toronto, minus the union of Ontario and Québec
-- statutory holidays (observed dates). Deadlines are computed once, when the clock starts, and
-- stored; editing this table affects new deadlines only.
--
-- Seed verified on 2026-11-12 against:
--   * Ontario ESA guide, "Public holidays" (ontario.ca): New Year's Day, Family Day, Good Friday,
--     Victoria Day, Canada Day, Labour Day, Thanksgiving, Christmas Day, Boxing Day.
--   * CNESST, "Statutory holidays" (cnesst.gouv.qc.ca): 1 January, Good Friday or Easter Monday,
--     Monday preceding 25 May, 24 June (Sunday -> 25 June, Loi sur la fête nationale), 1 July
--     (Sunday -> 2 July), Labour Day, Thanksgiving, 25 December. 11 Nov and 30 Sep are not holidays.
--   * Easter computed (Gregorian computus): 2026-04-05, 2027-03-28, 2028-04-16.
--   * Weekday substitutes for weekend Christmas / Boxing Day / New Year's Day per PD-019.
--     No substitute for Saturday 24 June 2028 or Saturday 1 July 2028.
-- Weekend dates are not stored: they never count anyway.

create table app.network_holidays (
  day date primary key check (extract(isodow from day) between 1 and 5),
  name text not null check (char_length(name) between 2 and 120),
  jurisdictions text[] not null check (jurisdictions <@ array['ON', 'QC']::text[] and cardinality(jurisdictions) > 0),
  created_at timestamptz not null default now()
);
alter table app.network_holidays enable row level security;
revoke all on app.network_holidays from public, anon, authenticated;

insert into app.network_holidays (day, name, jurisdictions) values
  ('2026-01-01', 'New Year''s Day', '{ON,QC}'),
  ('2026-02-16', 'Family Day', '{ON}'),
  ('2026-04-03', 'Good Friday', '{ON,QC}'),
  ('2026-04-06', 'Easter Monday', '{QC}'),
  ('2026-05-18', 'Victoria Day / National Patriots'' Day', '{ON,QC}'),
  ('2026-06-24', 'Fête nationale du Québec', '{QC}'),
  ('2026-07-01', 'Canada Day', '{ON,QC}'),
  ('2026-09-07', 'Labour Day', '{ON,QC}'),
  ('2026-10-12', 'Thanksgiving', '{ON,QC}'),
  ('2026-12-25', 'Christmas Day', '{ON,QC}'),
  ('2026-12-28', 'Boxing Day (observed; 26 Dec is a Saturday)', '{ON}'),
  ('2027-01-01', 'New Year''s Day', '{ON,QC}'),
  ('2027-02-15', 'Family Day', '{ON}'),
  ('2027-03-26', 'Good Friday', '{ON,QC}'),
  ('2027-03-29', 'Easter Monday', '{QC}'),
  ('2027-05-24', 'Victoria Day / National Patriots'' Day', '{ON,QC}'),
  ('2027-06-24', 'Fête nationale du Québec', '{QC}'),
  ('2027-07-01', 'Canada Day', '{ON,QC}'),
  ('2027-09-06', 'Labour Day', '{ON,QC}'),
  ('2027-10-11', 'Thanksgiving', '{ON,QC}'),
  ('2027-12-27', 'Christmas Day (observed; 25 Dec is a Saturday)', '{ON,QC}'),
  ('2027-12-28', 'Boxing Day (observed; 26 Dec is a Sunday)', '{ON}'),
  ('2028-01-03', 'New Year''s Day (observed; 1 Jan is a Saturday)', '{ON,QC}'),
  ('2028-02-21', 'Family Day', '{ON}'),
  ('2028-04-14', 'Good Friday', '{ON,QC}'),
  ('2028-04-17', 'Easter Monday', '{QC}'),
  ('2028-05-22', 'Victoria Day / National Patriots'' Day', '{ON,QC}'),
  ('2028-09-04', 'Labour Day', '{ON,QC}'),
  ('2028-10-09', 'Thanksgiving', '{ON,QC}'),
  ('2028-12-25', 'Christmas Day', '{ON,QC}'),
  ('2028-12-26', 'Boxing Day', '{ON}');

create or replace function app.is_business_day(p_day date) returns boolean
language sql stable security definer set search_path = '' as $$
  select extract(isodow from p_day) between 1 and 5
     and not exists (select 1 from app.network_holidays h where h.day = p_day);
$$;

-- Deadline = 23:59:59 America/Toronto on the Nth business day after the event's local date.
-- The event's own day never counts (delivered Friday 18:00 -> end of the following Friday).
create or replace function app.add_business_days(p_event timestamptz, p_n integer) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare
  d date := (p_event at time zone 'America/Toronto')::date;
  n integer := 0;
begin
  if p_event is null or p_n is null or p_n < 1 or p_n > 260 then
    raise exception 'invalid_business_days' using errcode = '22023';
  end if;
  while n < p_n loop
    d := d + 1;
    if app.is_business_day(d) then n := n + 1; end if;
  end loop;
  return (d + time '23:59:59') at time zone 'America/Toronto';
end $$;

-- Business days left before a deadline, not counting today: 0 means "ends today",
-- null means the deadline has passed (or there is none).
create or replace function app.business_days_left(p_deadline timestamptz, p_now timestamptz default now())
returns integer
language sql stable security definer set search_path = '' as $$
  select case
    when p_deadline is null or p_deadline < p_now then null
    else (select count(*)::integer
            from generate_series((p_now at time zone 'America/Toronto')::date + 1,
                                 (p_deadline at time zone 'America/Toronto')::date, interval '1 day') g(day)
           where app.is_business_day(g.day::date))
  end;
$$;

revoke execute on function app.is_business_day(date), app.add_business_days(timestamptz, integer),
  app.business_days_left(timestamptz, timestamptz) from public, anon, authenticated;
