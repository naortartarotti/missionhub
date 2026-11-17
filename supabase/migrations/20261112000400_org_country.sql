-- Workatent is global: an organization picks its country at onboarding and can change it later
-- (same row policy as the other editable columns: org admins only).
grant update (country) on public.organizations to authenticated;
