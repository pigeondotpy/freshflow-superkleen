-- Follow-up to 20261029_tenant_security_and_branding.sql.
-- That file was written against an older local copy and dropped the refund
-- netting that live close_daily_cashup already had (migration
-- freshflow_v06_refund_cashup). This keeps the new owner/admin guard and the
-- fixed search_path, and restores refunds being subtracted from expected takings.
create or replace function public.close_daily_cashup(
  p_business_date date,
  p_counted_cash numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  v_user uuid := auth.uid();
  v_business uuid;
  v_branch uuid;
  v_cash numeric(12,2);
  v_card numeric(12,2);
  v_eft numeric(12,2);
  v_id uuid;
begin
  perform public.assert_admin();
  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'Counted cash must be zero or greater';
  end if;

  select business_id, branch_id into v_business, v_branch
  from public.staff
  where id = v_user;

  select
    coalesce(sum(case when x.method = 'cash' then x.amount else 0 end), 0),
    coalesce(sum(case when x.method = 'card' then x.amount else 0 end), 0),
    coalesce(sum(case when x.method = 'eft' then x.amount else 0 end), 0)
  into v_cash, v_card, v_eft
  from (
    select p.method, p.amount
    from public.payments p
    join public.orders o on o.id = p.order_id
    where p.business_id = v_business
      and (v_branch is null or o.branch_id = v_branch)
      and (p.created_at at time zone 'Africa/Johannesburg')::date = p_business_date
    union all
    select r.method, -r.amount
    from public.refunds r
    join public.orders o on o.id = r.order_id
    where r.business_id = v_business
      and (v_branch is null or o.branch_id = v_branch)
      and (r.created_at at time zone 'Africa/Johannesburg')::date = p_business_date
  ) x;

  insert into public.cashups (
    business_id, branch_id, business_date,
    expected_cash, expected_card, expected_eft,
    counted_cash, variance, notes, closed_by, closed_at
  ) values (
    v_business, v_branch, p_business_date,
    v_cash, v_card, v_eft,
    p_counted_cash, p_counted_cash - v_cash,
    nullif(trim(coalesce(p_notes, '')), ''), v_user, now()
  )
  on conflict (business_id, branch_id, business_date)
  do update set
    expected_cash = excluded.expected_cash,
    expected_card = excluded.expected_card,
    expected_eft = excluded.expected_eft,
    counted_cash = excluded.counted_cash,
    variance = excluded.variance,
    notes = excluded.notes,
    closed_by = excluded.closed_by,
    closed_at = now()
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke all on function public.close_daily_cashup(date, numeric, text) from public, anon;
grant execute on function public.close_daily_cashup(date, numeric, text) to authenticated, service_role;
