-- Per-branch prices.
--
-- Apply this whole file once, after 20261029_tenant_security_and_branding.sql.
-- It does not change existing service prices. A branch with no row here
-- keeps charging the shop price on services.price.
--
-- The till ignores the price sent by the browser for a catalogue item and
-- uses the caller's branch price instead. Hiding a service at a branch
-- keeps it off that branch's till. Other branches are not affected.

create table if not exists public.branch_service_prices (
  business_id uuid not null references public.businesses (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  price numeric(12,2) not null check (price >= 0),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (branch_id, service_id)
);

create index if not exists branch_service_prices_business_idx
  on public.branch_service_prices (business_id);

comment on table public.branch_service_prices is
  'Optional per-branch price or hide flag. No row means the shop price on services.';

comment on column public.branch_service_prices.active is
  'False hides the service at this branch. True charges price instead of the shop price.';

alter table public.branch_service_prices enable row level security;

-- The branch and the service have to belong to the same shop as the row.
create or replace function public.guard_branch_service_price()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
begin
  if not exists (
    select 1
    from public.branches b
    where b.id = new.branch_id
      and b.business_id = new.business_id
  ) then
    raise exception 'Branch does not belong to this business';
  end if;
  if not exists (
    select 1
    from public.services s
    where s.id = new.service_id
      and s.business_id = new.business_id
  ) then
    raise exception 'Service does not belong to this business';
  end if;
  return new;
end;
$fn$;

drop trigger if exists branch_service_prices_guard on public.branch_service_prices;
create trigger branch_service_prices_guard
before insert or update on public.branch_service_prices
for each row execute function public.guard_branch_service_price();

-- Shop price, unless this branch has its own row.
-- Null means the service cannot be sold there: it is missing, inactive,
-- or hidden at that branch. The app cannot call this. The till functions do.
create or replace function public.branch_service_sell_price(
  p_business_id uuid,
  p_branch_id uuid,
  p_service_id uuid
)
returns numeric
language sql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $fn$
  select case
    when bsp.active is false then null
    else coalesce(bsp.price, s.price)
  end
  from public.services s
  left join public.branch_service_prices bsp
    on bsp.service_id = s.id
   and bsp.business_id = s.business_id
   and p_branch_id is not null
   and bsp.branch_id = p_branch_id
  where s.id = p_service_id
    and s.business_id = p_business_id
    and s.active = true;
$fn$;

-- Catalogue lines are priced here. The unit_price in the request is ignored
-- for those lines. A line with no service id is a one-off item, and only an
-- owner or admin can add one.

create or replace function public.create_order(
  p_customer_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_due_date date,
  p_instructions text,
  p_items jsonb,
  p_payment_method text default null
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
  v_customer uuid;
  v_order uuid;
  v_order_number bigint;
  v_total numeric(12,2);
  v_item jsonb;
  v_service uuid;
  v_desc text;
  v_qty numeric(12,2);
  v_price numeric(12,2);
  v_role text;
  v_resolved jsonb := '[]'::jsonb;
begin
  v_business := public.assert_staff();
  v_role := coalesce(public.current_staff_role(), '');
  select branch_id into v_branch from public.staff where id = v_user;
  if p_due_date is null then raise exception 'Due date is required'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one order item is required';
  end if;

  if p_customer_id is not null then
    select id into v_customer from public.customers where id = p_customer_id and business_id = v_business;
    if v_customer is null then raise exception 'Customer not found for this business'; end if;
    update public.customers set name = p_customer_name, phone = p_customer_phone where id = v_customer;
  else
    select id into v_customer
    from public.customers
    where business_id = v_business
      and normalized_phone = regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]+', '', 'g')
    limit 1;
    if v_customer is null then
      insert into public.customers (business_id, name, phone)
      values (v_business, p_customer_name, p_customer_phone)
      returning id into v_customer;
    else
      update public.customers set name = p_customer_name, phone = p_customer_phone where id = v_customer;
    end if;
  end if;

  v_total := 0;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_service := nullif(v_item->>'service_id', '')::uuid;
    v_desc := nullif(trim(v_item->>'description'), '');
    v_qty := (v_item->>'quantity')::numeric;
    if v_desc is null or v_qty is null or v_qty <= 0 then
      raise exception 'Invalid order item';
    end if;
    if v_service is null then
      v_price := (v_item->>'unit_price')::numeric;
      if v_role not in ('owner', 'admin') then
        raise exception 'Custom prices require an owner or admin';
      end if;
      if v_price is null or v_price < 0 then
        raise exception 'Invalid order item';
      end if;
    else
      v_price := public.branch_service_sell_price(v_business, v_branch, v_service);
      if v_price is null then
        raise exception 'Service is not available at this branch';
      end if;
    end if;
    v_total := v_total + (v_qty * v_price);
    v_resolved := v_resolved || jsonb_build_array(jsonb_build_object(
      'service_id', v_service,
      'description', v_desc,
      'quantity', v_qty,
      'unit_price', v_price
    ));
  end loop;

  select next_order_number into v_order_number
  from public.businesses
  where id = v_business
  for update;
  update public.businesses set next_order_number = v_order_number + 1 where id = v_business;

  insert into public.orders (
    business_id, branch_id, customer_id, order_number, status, due_date,
    instructions, total, payment_status, created_by
  ) values (
    v_business, v_branch, v_customer, v_order_number, 'Received', p_due_date,
    p_instructions, v_total,
    case when p_payment_method is null then 'unpaid' else 'paid' end,
    v_user
  )
  returning id into v_order;

  for v_item in select value from jsonb_array_elements(v_resolved)
  loop
    insert into public.order_items (order_id, service_id, description, quantity, unit_price)
    values (
      v_order,
      nullif(v_item->>'service_id', '')::uuid,
      v_item->>'description',
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price')::numeric
    );
  end loop;

  if p_payment_method is not null then
    if p_payment_method not in ('cash', 'card', 'eft', 'other') then
      raise exception 'Invalid payment method';
    end if;
    insert into public.payments (business_id, order_id, amount, method, created_by)
    values (v_business, v_order, v_total, p_payment_method, v_user);
  end if;

  return v_order;
end;
$fn$;

create or replace function public.create_quote(
  p_customer_id uuid,
  p_valid_until date,
  p_notes text,
  p_discount numeric,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  v_business uuid;
  v_branch uuid;
  v_id uuid;
  v_sub numeric := 0;
  v_role text;
  v_service uuid;
  v_price numeric;
  v_qty numeric;
  v_resolved jsonb := '[]'::jsonb;
  x jsonb;
begin
  v_business := public.assert_staff();
  v_role := coalesce(public.current_staff_role(), '');
  select branch_id into v_branch from public.staff where id = auth.uid();
  if not exists (
    select 1 from public.customers where id = p_customer_id and business_id = v_business
  ) then
    raise exception 'Customer not found';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Quote requires at least one item';
  end if;
  if coalesce(p_discount, 0) > 0 and v_role not in ('owner', 'admin') then
    raise exception 'Owner or admin access required';
  end if;

  for x in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((x->>'quantity')::numeric, 0);
    v_service := nullif(x->>'service_id', '')::uuid;
    if v_qty <= 0 or nullif(trim(x->>'description'), '') is null then
      raise exception 'Invalid quote item';
    end if;
    if v_service is null then
      v_price := coalesce((x->>'unit_price')::numeric, 0);
      if v_role not in ('owner', 'admin') then
        raise exception 'Custom prices require an owner or admin';
      end if;
      if v_price < 0 then
        raise exception 'Invalid quote item';
      end if;
    else
      v_price := public.branch_service_sell_price(v_business, v_branch, v_service);
      if v_price is null then
        raise exception 'Service is not available at this branch';
      end if;
    end if;
    v_sub := v_sub + (v_qty * v_price);
    v_resolved := v_resolved || jsonb_build_array(jsonb_build_object(
      'service_id', v_service,
      'description', x->>'description',
      'quantity', v_qty,
      'unit_price', v_price
    ));
  end loop;

  if coalesce(p_discount, 0) < 0 or coalesce(p_discount, 0) > v_sub then
    raise exception 'Invalid discount';
  end if;

  insert into public.quotes (
    business_id, branch_id, customer_id, status, valid_until,
    subtotal, discount_amount, total, notes, created_by
  ) values (
    v_business, v_branch, p_customer_id, 'draft', p_valid_until,
    v_sub, coalesce(p_discount, 0), v_sub - coalesce(p_discount, 0),
    nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
  )
  returning id into v_id;

  for x in select * from jsonb_array_elements(v_resolved)
  loop
    insert into public.quote_items (quote_id, service_id, description, quantity, unit_price)
    values (
      v_id,
      nullif(x->>'service_id', '')::uuid,
      x->>'description',
      (x->>'quantity')::numeric,
      (x->>'unit_price')::numeric
    );
  end loop;

  return v_id;
end;
$fn$;

drop policy if exists "staff read branch prices" on public.branch_service_prices;
create policy "staff read branch prices"
on public.branch_service_prices
for select to authenticated
using (
  business_id = public.current_business_id()
  and (
    public.current_staff_role() in ('owner', 'admin')
    or branch_id = public.current_branch_id()
  )
);

drop policy if exists "admin write branch prices" on public.branch_service_prices;
create policy "admin write branch prices"
on public.branch_service_prices
for all to authenticated
using (
  business_id = public.current_business_id()
  and public.current_staff_role() in ('owner', 'admin')
)
with check (
  business_id = public.current_business_id()
  and public.current_staff_role() in ('owner', 'admin')
);

revoke all on function public.guard_branch_service_price() from public, anon, authenticated, service_role;
revoke all on function public.branch_service_sell_price(uuid, uuid, uuid) from public, anon, authenticated, service_role;

revoke all on table public.branch_service_prices from anon, public;
grant select, insert, update, delete on table public.branch_service_prices to authenticated;
grant all on table public.branch_service_prices to service_role;
