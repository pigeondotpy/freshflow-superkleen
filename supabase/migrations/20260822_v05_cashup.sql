-- FreshFlow Superkleen V0.5 migration
-- Adds persistent daily cash ups for the counter pilot.

create table if not exists public.cashups (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  business_date date not null,
  expected_cash numeric(12,2) not null default 0,
  expected_card numeric(12,2) not null default 0,
  expected_eft numeric(12,2) not null default 0,
  counted_cash numeric(12,2) not null default 0,
  variance numeric(12,2) not null default 0,
  notes text,
  closed_by uuid references public.staff(id),
  closed_at timestamptz not null default now(),
  unique (business_id, branch_id, business_date)
);

create index if not exists cashups_business_date_idx
  on public.cashups (business_id, business_date desc);

alter table public.cashups enable row level security;

drop policy if exists "staff can read cashups" on public.cashups;
create policy "staff can read cashups" on public.cashups
for select to authenticated
using (business_id = public.current_business_id());

drop policy if exists "staff can create cashups" on public.cashups;
create policy "staff can create cashups" on public.cashups
for insert to authenticated
with check (business_id = public.current_business_id());

drop policy if exists "staff can update cashups" on public.cashups;
create policy "staff can update cashups" on public.cashups
for update to authenticated
using (business_id = public.current_business_id())
with check (business_id = public.current_business_id());

create or replace function public.close_daily_cashup(
  p_business_date date,
  p_counted_cash numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_business uuid;
  v_branch uuid;
  v_cash numeric(12,2);
  v_card numeric(12,2);
  v_eft numeric(12,2);
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_counted_cash is null or p_counted_cash < 0 then raise exception 'Counted cash must be zero or greater'; end if;

  select business_id, branch_id into v_business, v_branch
  from public.staff where id = v_user;
  if v_business is null then raise exception 'Staff profile not found'; end if;

  select
    coalesce(sum(p.amount) filter (where p.method='cash'),0),
    coalesce(sum(p.amount) filter (where p.method='card'),0),
    coalesce(sum(p.amount) filter (where p.method='eft'),0)
  into v_cash, v_card, v_eft
  from public.payments p
  join public.orders o on o.id = p.order_id
  where p.business_id = v_business
    and (v_branch is null or o.branch_id = v_branch)
    and (p.created_at at time zone 'Africa/Johannesburg')::date = p_business_date;

  insert into public.cashups(
    business_id, branch_id, business_date,
    expected_cash, expected_card, expected_eft,
    counted_cash, variance, notes, closed_by, closed_at
  ) values (
    v_business, v_branch, p_business_date,
    v_cash, v_card, v_eft,
    p_counted_cash, p_counted_cash - v_cash,
    nullif(trim(coalesce(p_notes,'')),''), v_user, now()
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
$$;

revoke all on function public.close_daily_cashup(date,numeric,text) from public;
grant execute on function public.close_daily_cashup(date,numeric,text) to authenticated;

do $$
begin
  begin alter publication supabase_realtime add table public.cashups;
  exception when duplicate_object then null;
  end;
end $$;
