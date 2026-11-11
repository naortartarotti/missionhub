-- Re-match when mobility changes: the engine now reads relocation scope / destinations, work
-- authorization and travel (candidates) and travel / visa sponsorship / relocation support (jobs).
drop trigger candidates_enqueue_matching on public.candidates;
create trigger candidates_enqueue_matching after insert or update of
  status, skills, languages, seniority, years_experience, work_arrangements, location_country, location_region,
  location_city, open_to_relocation, salary_expectation_min, salary_expectation_max, salary_currency, headline, summary,
  relocation_scope, relocation_destinations, work_authorization, travel_availability
  on public.candidates for each row execute function app.on_candidate_change();

drop trigger jobs_enqueue_matching on public.jobs;
create trigger jobs_enqueue_matching after insert or update of
  status, accepts_external_referrals, required_skills, preferred_skills, languages, seniority, min_years_experience,
  work_arrangement, location_country, location_region, location_city, salary_min, salary_max, salary_currency,
  title, description, travel_requirement, visa_sponsorship, relocation_support
  on public.jobs for each row execute function app.on_job_change();
