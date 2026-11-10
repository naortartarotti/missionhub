-- Wallet admin: let platform admins run the reconciliation check from the admin area.
-- The payment worker (service_role, no auth.uid()) keeps its access; any other signed-in user is refused.
-- The return type is unchanged, but the body needs plpgsql to raise, so the function is recreated.

drop function if exists public.wallet_reconcile();
create function public.wallet_reconcile()
returns table (account_id uuid, cached_minor bigint, computed_minor bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not app.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select a.id, a.balance_minor, coalesce(s.total, 0)::bigint
    from public.wallet_accounts a
    left join (select e.account_id, sum(e.amount_minor) as total from public.wallet_entries e group by e.account_id) s
      on s.account_id = a.id
    where a.balance_minor <> coalesce(s.total, 0)
    union all
    select null::uuid, 0::bigint, t.total::bigint
    from (select coalesce(sum(e.amount_minor), 0) as total from public.wallet_entries e) t
    where t.total <> 0;
end $$;

revoke execute on function public.wallet_reconcile() from public, anon, authenticated, service_role;
grant execute on function public.wallet_reconcile() to authenticated, service_role;
