-- N3 v2 (frontend.md §5 items 4 and 5): the fee-pending panel and the fee-details dialog need the server's
-- business-day count for `fee_details_due_at` (holiday calendar) and the allowed start-date window
-- (PD-077: [delivery − 1 year, today + 548 days]). Either org of the placement; anyone else gets not_found.
create function public.get_placement_fee_state(p_placement uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.placements;
  r public.referrals;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into p from public.placements where id = p_placement;
  if not found or not app.can_see_placement(p.id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into r from public.referrals where id = p.referral_id;
  return jsonb_build_object(
    'placement_id', p.id,
    'status', p.status,
    'fee_details_due_at', p.fee_details_due_at,
    'fee_details_business_days_left', case when p.fee_details_entered_at is null then app.business_days_left(p.fee_details_due_at) end,
    'fee_details_overdue', p.fee_details_entered_at is null and p.fee_details_due_at < now(),
    'delivered_at', r.delivered_at,
    'start_date_min', ((coalesce(r.delivered_at, r.submitted_at) at time zone 'America/Toronto')::date - interval '1 year')::date,
    'start_date_max', (now() at time zone 'America/Toronto')::date + 548);
end $$;
revoke execute on function public.get_placement_fee_state(uuid) from public, anon;
grant execute on function public.get_placement_fee_state(uuid) to authenticated;
