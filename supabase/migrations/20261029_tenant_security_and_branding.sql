-- FreshFlow multi-tenant security and per-shop branding.
--
-- Apply this whole file once, in the Supabase SQL editor, as the database owner.
-- Do not run it one statement at a time. It does not delete orders, customers,
-- or Superkleen's price list.
--
-- After it runs:
--   * anon cannot call any public function or read any public table
--   * signed-in staff only see their own business (RLS was already scoped; the
--     holes were security-definer functions and a few policies that were wider
--     than the role the screen implied)
--   * a new shop gets its own name, receipt text, and a starter price list
--   * Superkleen's existing services are left untouched

-- ---------------------------------------------------------------------------
-- Branding columns. Existing shops keep working when these are still blank.
-- ---------------------------------------------------------------------------

alter table public.business_settings
  add column if not exists receipt_title text,
  add column if not exists receipt_subtitle text,
  add column if not exists message_name text,
  add column if not exists logo_url text;

-- Superkleen's printed slip and WhatsApp wording stay as they are today.
update public.business_settings bs
set
  receipt_title = coalesce(nullif(trim(bs.receipt_title), ''), 'SUPERKLEEN'),
  receipt_subtitle = coalesce(nullif(trim(bs.receipt_subtitle), ''), 'DRY CLEANERS'),
  message_name = coalesce(nullif(trim(bs.message_name), ''), 'Superkleen'),
  receipt_footer = coalesce(nullif(trim(bs.receipt_footer), ''), 'Thank you for choosing Superkleen.')
from public.businesses b
where b.id = bs.business_id
  and b.name ilike '%superkleen%';

-- ---------------------------------------------------------------------------
-- Caller checks. NULL role must fail closed. `role not in (...)` is NULL
-- when the role is NULL, and a NULL if-test does not raise.
-- ---------------------------------------------------------------------------

create or replace function public.assert_staff()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  v_business uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select business_id into v_business
  from public.staff
  where id = auth.uid();
  if v_business is null then
    raise exception 'Staff profile not found';
  end if;
  return v_business;
end;
$fn$;

create or replace function public.assert_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  v_business uuid;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select business_id, role into v_business, v_role
  from public.staff
  where id = auth.uid();
  if v_business is null then
    raise exception 'Staff profile not found';
  end if;
  if coalesce(v_role, '') not in ('owner', 'admin') then
    raise exception 'Owner or admin access required';
  end if;
  return v_business;
end;
$fn$;

create or replace function public.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
  select business_id from public.staff where id = auth.uid();
$fn$;

create or replace function public.current_branch_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
  select branch_id from public.staff where id = auth.uid();
$fn$;

create or replace function public.current_staff_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
  select role from public.staff where id = auth.uid();
$fn$;

-- ---------------------------------------------------------------------------
-- Starter price list for a brand-new shop. Never deactivates or reprices
-- rows that are already there, so Superkleen's catalogue is not touched.
-- Not granted to the app. bootstrap_business calls it.
-- ---------------------------------------------------------------------------

create or replace function public.install_starter_catalog(p_business_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  v_count integer := 0;
begin
  if p_business_id is null then
    raise exception 'Business is required';
  end if;

  insert into public.services (
    business_id, catalog_code, category, service_group, item_name, name, unit, price, active
  )
  select p_business_id, v.catalog_code, v.category, v.service_group, v.item_name, v.item_name, v.unit, v.price, true
  from (
    values
      ('FF-DC-SHIRT', 'Dry-cleaning', 'Garments', 'Shirt', 'item', 45.00),
      ('FF-DC-BLOUSE', 'Dry-cleaning', 'Garments', 'Blouse', 'item', 48.00),
      ('FF-DC-TROUSERS', 'Dry-cleaning', 'Garments', 'Trousers', 'item', 55.00),
      ('FF-DC-SKIRT', 'Dry-cleaning', 'Garments', 'Skirt', 'item', 55.00),
      ('FF-DC-DRESS', 'Dry-cleaning', 'Garments', 'Dress', 'item', 85.00),
      ('FF-DC-JACKET', 'Dry-cleaning', 'Garments', 'Jacket / blazer', 'item', 75.00),
      ('FF-DC-JERSEY', 'Dry-cleaning', 'Garments', 'Jersey / knitwear', 'item', 65.00),
      ('FF-DC-SUIT', 'Dry-cleaning', 'Garments', 'Suit, 2 piece', 'item', 145.00),
      ('FF-DC-COAT', 'Dry-cleaning', 'Garments', 'Coat', 'item', 120.00),
      ('FF-DC-TIE', 'Dry-cleaning', 'Garments', 'Tie', 'item', 30.00),
      ('FF-DC-WAISTCOAT', 'Dry-cleaning', 'Garments', 'Waistcoat', 'item', 55.00),
      ('FF-DC-DUVET-S', 'Dry-cleaning', 'Household', 'Duvet, single', 'item', 140.00),
      ('FF-DC-DUVET-D', 'Dry-cleaning', 'Household', 'Duvet, double', 'item', 170.00),
      ('FF-DC-DUVET-Q', 'Dry-cleaning', 'Household', 'Duvet, queen', 'item', 190.00),
      ('FF-DC-DUVET-K', 'Dry-cleaning', 'Household', 'Duvet, king', 'item', 210.00),
      ('FF-DC-BLANKET', 'Dry-cleaning', 'Household', 'Blanket', 'item', 95.00),
      ('FF-DC-CURTAINS', 'Dry-cleaning', 'Household', 'Curtains', 'kg', 70.00),
      ('FF-DC-PILLOW', 'Dry-cleaning', 'Household', 'Pillow', 'item', 45.00),
      ('FF-LD-FOLD', 'Laundry', 'Laundry', 'Wash, dry and fold', 'kg', 28.00),
      ('FF-LD-IRON', 'Laundry', 'Laundry', 'Wash and iron', 'kg', 38.00),
      ('FF-LD-SHIRT', 'Laundry', 'Laundry', 'Shirt, laundry', 'item', 25.00),
      ('FF-LD-LINEN', 'Laundry', 'Laundry', 'Linen', 'kg', 32.00),
      ('FF-PR-SHIRT', 'Press Only', 'Pressing', 'Shirt, press only', 'item', 20.00),
      ('FF-PR-TROUSERS', 'Press Only', 'Pressing', 'Trousers, press only', 'item', 25.00),
      ('FF-PR-DRESS', 'Press Only', 'Pressing', 'Dress, press only', 'item', 35.00),
      ('FF-AL-HEM-T', 'Alterations', 'Alterations', 'Trouser hem', 'item', 70.00),
      ('FF-AL-HEM-D', 'Alterations', 'Alterations', 'Dress hem', 'item', 90.00),
      ('FF-AL-ZIP', 'Alterations', 'Alterations', 'Zip replacement', 'item', 120.00),
      ('FF-AL-BUTTON', 'Alterations', 'Alterations', 'Sew on a button', 'item', 15.00),
      ('FF-CB-HEEL', 'Cobbling', 'Shoe repair', 'Heel tips', 'pair', 80.00),
      ('FF-CB-SOLE', 'Cobbling', 'Shoe repair', 'Half sole', 'pair', 180.00),
      ('FF-CB-STITCH', 'Cobbling', 'Shoe repair', 'Stitch repair', 'pair', 90.00),
      ('FF-LS-JACKET', 'Leather&Suede', 'Leather', 'Leather jacket', 'item', 280.00),
      ('FF-LS-SUEDE', 'Leather&Suede', 'Suede', 'Suede jacket', 'item', 300.00),
      ('FF-HK-IRON', 'Housekeeping', 'Household', 'Iron only', 'kg', 30.00),
      ('FF-HK-SNEAKER', 'Housekeeping', 'Household', 'Sneaker clean', 'pair', 120.00),
      ('FF-OS-WEDDING', 'Outsource', 'Special', 'Wedding dress', 'item', 450.00),
      ('FF-OS-EXPRESS', 'Outsource', 'Special', 'Same-day express', 'order', 80.00)
  ) as v(catalog_code, category, service_group, item_name, unit, price)
  where not exists (
    select 1
    from public.services s
    where s.business_id = p_business_id
      and s.catalog_code = v.catalog_code
  );

  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

-- The old installer copied one shop's full price book onto whoever called it.
-- The rows already loaded for Superkleen stay in the services table.
create or replace function public.install_superkleen_catalog()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
begin
  raise exception 'This catalogue installer has been retired. New shops get a starter price list when they sign up. Owners edit prices in the app.';
end;
$fn$;

create or replace function public.bootstrap_business(
  p_business_name text,
  p_full_name text,
  p_phone text default null,
  p_address text default null,
  p_vat_number text default null,
  p_receipt_footer text default null,
  p_receipt_title text default null,
  p_receipt_subtitle text default null
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
  v_name text;
  v_title text;
  v_subtitle text;
  v_footer text;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  -- A person who already belongs to a shop must not open a second one,
  -- and must not have their catalogue replaced.
  if exists (select 1 from public.staff where id = v_user) then
    select business_id into v_business from public.staff where id = v_user;
    return v_business;
  end if;

  v_name := coalesce(nullif(trim(p_business_name), ''), 'My Dry Cleaners');
  v_title := coalesce(nullif(trim(p_receipt_title), ''), v_name);
  v_subtitle := coalesce(nullif(trim(p_receipt_subtitle), ''), 'Dry Cleaners');
  v_footer := coalesce(nullif(trim(p_receipt_footer), ''), 'Thank you for your business.');

  insert into public.businesses (name)
  values (v_name)
  returning id into v_business;

  insert into public.branches (business_id, name)
  values (v_business, 'Main Branch')
  returning id into v_branch;

  insert into public.staff (id, business_id, branch_id, full_name, role)
  values (
    v_user,
    v_business,
    v_branch,
    coalesce(nullif(trim(p_full_name), ''), 'Owner'),
    'owner'
  );

  insert into public.business_settings (
    business_id,
    vat_number,
    receipt_address,
    receipt_phone,
    receipt_footer,
    receipt_title,
    receipt_subtitle,
    message_name
  ) values (
    v_business,
    nullif(trim(coalesce(p_vat_number, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    v_footer,
    v_title,
    v_subtitle,
    v_name
  );

  perform public.install_starter_catalog(v_business);
  return v_business;
end;
$fn$;

drop function if exists public.bootstrap_business(text, text);

-- ---------------------------------------------------------------------------
-- Till functions. Prices on a sale follow the price list unless the caller
-- is an owner or admin. Every lookup is limited to the caller's business.
-- ---------------------------------------------------------------------------

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
  v_catalog numeric(12,2);
  v_role text;
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
    v_price := (v_item->>'unit_price')::numeric;
    if v_desc is null or v_qty is null or v_qty <= 0 or v_price is null or v_price < 0 then
      raise exception 'Invalid order item';
    end if;
    if v_service is null then
      if v_role not in ('owner', 'admin') then
        raise exception 'Custom prices require an owner or admin';
      end if;
    else
      select price into v_catalog
      from public.services
      where id = v_service and business_id = v_business and active = true;
      if v_catalog is null then
        raise exception 'Service does not belong to this business';
      end if;
      if v_role not in ('owner', 'admin') and abs(v_price - v_catalog) > 0.009 then
        raise exception 'Price changes require an owner or admin';
      end if;
    end if;
    v_total := v_total + (v_qty * v_price);
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

  for v_item in select value from jsonb_array_elements(p_items)
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
  v_catalog numeric;
  v_service uuid;
  v_price numeric;
  v_qty numeric;
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
    v_price := coalesce((x->>'unit_price')::numeric, 0);
    v_service := nullif(x->>'service_id', '')::uuid;
    if v_qty <= 0 or v_price < 0 or nullif(trim(x->>'description'), '') is null then
      raise exception 'Invalid quote item';
    end if;
    if v_service is null then
      if v_role not in ('owner', 'admin') then
        raise exception 'Custom prices require an owner or admin';
      end if;
    else
      select price into v_catalog
      from public.services
      where id = v_service and business_id = v_business and active = true;
      if v_catalog is null then
        raise exception 'Service does not belong to this business';
      end if;
      if v_role not in ('owner', 'admin') and abs(v_price - v_catalog) > 0.009 then
        raise exception 'Price changes require an owner or admin';
      end if;
    end if;
    v_sub := v_sub + (v_qty * v_price);
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

  for x in select * from jsonb_array_elements(p_items)
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

create or replace function public.accept_quote_to_order(
  p_quote_id uuid,
  p_due_date date,
  p_deposit_required numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  q public.quotes%rowtype;
  v_order uuid;
  v_number bigint;
begin
  perform public.assert_staff();
  select * into q
  from public.quotes
  where id = p_quote_id
    and business_id = public.current_business_id()
  for update;
  if q.id is null then raise exception 'Quote not found'; end if;
  if q.status not in ('draft', 'sent') then raise exception 'Quote is not open'; end if;
  if q.valid_until is not null and q.valid_until < current_date then
    raise exception 'Quote has expired';
  end if;

  select coalesce(max(order_number), 1000) + 1 into v_number
  from public.orders
  where business_id = q.business_id;

  insert into public.orders (
    business_id, branch_id, customer_id, order_number, status, due_date,
    instructions, total, payment_status, created_by, discount_amount,
    discount_reason, deposit_required, quote_id
  ) values (
    q.business_id, q.branch_id, q.customer_id, v_number, 'Received', p_due_date,
    q.notes, q.total, 'unpaid', auth.uid(), q.discount_amount,
    case when q.discount_amount > 0 then 'Quote discount' end,
    greatest(coalesce(p_deposit_required, 0), 0), q.id
  )
  returning id into v_order;

  insert into public.order_items (order_id, service_id, description, quantity, unit_price)
  select v_order, service_id, description, quantity, unit_price
  from public.quote_items
  where quote_id = q.id;

  update public.quotes set status = 'accepted', accepted_at = now() where id = q.id;
  insert into public.audit_log (business_id, actor_id, action, entity_type, entity_id, detail)
  values (
    q.business_id, auth.uid(), 'quote_accepted', 'order', v_order,
    jsonb_build_object('quote_id', q.id, 'deposit_required', p_deposit_required)
  );
  return v_order;
end;
$fn$;

create or replace function public.apply_order_discount(
  p_order_id uuid,
  p_amount numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  v_business uuid;
  v_total numeric;
begin
  perform public.assert_admin();
  select business_id, total into v_business, v_total
  from public.orders
  where id = p_order_id;
  if v_business is distinct from public.current_business_id() then
    raise exception 'Order not found';
  end if;
  if p_amount < 0 or p_amount > v_total then
    raise exception 'Invalid discount';
  end if;
  update public.orders
  set discount_amount = p_amount,
      discount_reason = nullif(trim(p_reason), ''),
      discount_by = auth.uid(),
      total = greatest(0, (
        select coalesce(sum(line_total), 0)
        from public.order_items
        where order_id = p_order_id
      ) - p_amount)
  where id = p_order_id;
  insert into public.audit_log (business_id, actor_id, action, entity_type, entity_id, detail)
  values (
    v_business, auth.uid(), 'discount_applied', 'order', p_order_id,
    jsonb_build_object('amount', p_amount, 'reason', p_reason)
  );
end;
$fn$;

create or replace function public.override_order_item_price(
  p_item_id uuid,
  p_new_price numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  v_order uuid;
  v_business uuid;
  v_old numeric;
begin
  perform public.assert_admin();
  if p_new_price is null or p_new_price < 0 then
    raise exception 'Invalid price';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required';
  end if;
  select oi.order_id, o.business_id, oi.unit_price
  into v_order, v_business, v_old
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.id = p_item_id;
  if v_business is distinct from public.current_business_id() then
    raise exception 'Item not found';
  end if;
  update public.order_items
  set original_unit_price = coalesce(original_unit_price, unit_price),
      unit_price = p_new_price,
      price_override_reason = trim(p_reason),
      price_override_by = auth.uid()
  where id = p_item_id;
  update public.orders
  set total = greatest(0, (
    select coalesce(sum(quantity * unit_price), 0)
    from public.order_items
    where order_id = v_order
  ) - discount_amount)
  where id = v_order;
  insert into public.audit_log (business_id, actor_id, action, entity_type, entity_id, detail)
  values (
    v_business, auth.uid(), 'price_override', 'order_item', p_item_id,
    jsonb_build_object('old', v_old, 'new', p_new_price, 'reason', p_reason)
  );
end;
$fn$;

create or replace function public.set_order_deposit(p_order_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  v_business uuid;
begin
  perform public.assert_staff();
  select business_id into v_business from public.orders where id = p_order_id;
  if v_business is distinct from public.current_business_id() then
    raise exception 'Order not found';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'Invalid deposit';
  end if;
  update public.orders set deposit_required = p_amount where id = p_order_id;
  insert into public.audit_log (business_id, actor_id, action, entity_type, entity_id, detail)
  values (
    v_business, auth.uid(), 'deposit_requirement_set', 'order', p_order_id,
    jsonb_build_object('amount', p_amount)
  );
end;
$fn$;

create or replace function public.confirm_order_collection(p_order_id uuid, p_collected_by text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  v_business uuid;
begin
  perform public.assert_staff();
  select business_id into v_business from public.orders where id = p_order_id;
  if v_business is distinct from public.current_business_id() then
    raise exception 'Order not found';
  end if;
  update public.orders
  set status = 'Collected',
      collection_confirmed_at = now(),
      collection_confirmed_by = auth.uid(),
      collected_by_name = nullif(trim(p_collected_by), '')
  where id = p_order_id;
  insert into public.audit_log (business_id, actor_id, action, entity_type, entity_id, detail)
  values (
    v_business, auth.uid(), 'collection_confirmed', 'order', p_order_id,
    jsonb_build_object('collected_by', p_collected_by)
  );
end;
$fn$;

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
    coalesce(sum(p.amount) filter (where p.method = 'cash'), 0),
    coalesce(sum(p.amount) filter (where p.method = 'card'), 0),
    coalesce(sum(p.amount) filter (where p.method = 'eft'), 0)
  into v_cash, v_card, v_eft
  from public.payments p
  join public.orders o on o.id = p.order_id
  where p.business_id = v_business
    and (v_branch is null or o.branch_id = v_branch)
    and (p.created_at at time zone 'Africa/Johannesburg')::date = p_business_date;

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

create or replace function public.inventory_adjust(
  p_item_id uuid,
  p_quantity numeric,
  p_type text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  v_item public.inventory_items%rowtype;
  v_delta numeric;
begin
  perform public.assert_admin();
  select * into v_item
  from public.inventory_items
  where id = p_item_id
    and business_id = public.current_business_id()
  for update;
  if v_item.id is null then raise exception 'Inventory item not found'; end if;
  if p_type not in ('purchase', 'use', 'adjustment', 'waste') then
    raise exception 'Invalid movement type';
  end if;
  v_delta := case
    when p_type = 'purchase' then abs(p_quantity)
    when p_type in ('use', 'waste') then -abs(p_quantity)
    else p_quantity
  end;
  if v_item.quantity + v_delta < 0 then raise exception 'Insufficient stock'; end if;
  update public.inventory_items
  set quantity = quantity + v_delta, updated_at = now()
  where id = p_item_id;
  insert into public.inventory_movements (
    business_id, branch_id, item_id, movement_type, quantity, note, created_by
  ) values (
    v_item.business_id, v_item.branch_id, v_item.id, p_type, v_delta, p_note, auth.uid()
  );
end;
$fn$;

create or replace function public.admin_dashboard(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  v_business uuid;
begin
  v_business := public.assert_admin();
  return jsonb_build_object(
    'sales', coalesce((
      select sum(total) from public.orders
      where business_id = v_business and status <> 'Cancelled'
        and created_at::date between p_from and p_to
    ), 0),
    'orders', (
      select count(*) from public.orders
      where business_id = v_business and status <> 'Cancelled'
        and created_at::date between p_from and p_to
    ),
    'expenses', coalesce((
      select sum(amount) from public.expenses
      where business_id = v_business and expense_date between p_from and p_to
    ), 0),
    'outstanding', coalesce((
      select sum(greatest(
        o.total
        - coalesce((select sum(p.amount) from public.payments p where p.order_id = o.id), 0)
        + coalesce((select sum(r.amount) from public.refunds r where r.order_id = o.id), 0),
        0
      ))
      from public.orders o
      where o.business_id = v_business and o.status <> 'Cancelled'
    ), 0),
    'overdue', (
      select count(*) from public.orders
      where business_id = v_business
        and status not in ('Collected', 'Cancelled', 'Ready')
        and due_date < current_date
    ),
    'ready', (
      select count(*) from public.orders
      where business_id = v_business and status = 'Ready'
    ),
    'commercial_debt', coalesce((
      select sum(greatest(
        o.total - coalesce((select sum(p.amount) from public.payments p where p.order_id = o.id), 0),
        0
      ))
      from public.orders o
      join public.customers c on c.id = o.customer_id
      where o.business_id = v_business
        and c.account_type = 'commercial'
        and o.status <> 'Cancelled'
    ), 0)
  );
end;
$fn$;

create or replace function public.owner_business_snapshot(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  v_business uuid;
  v_sales numeric;
  v_exp numeric;
  v_supplier numeric;
  v_recurring numeric;
  v_orders bigint;
  v_staff bigint;
  v_low_stock bigint;
  v_debt numeric;
begin
  v_business := public.assert_admin();
  select coalesce(sum(total), 0), count(*) into v_sales, v_orders
  from public.orders
  where business_id = v_business and status <> 'Cancelled'
    and created_at::date between p_from and p_to;
  select coalesce(sum(amount), 0) into v_exp
  from public.expenses
  where business_id = v_business and expense_date between p_from and p_to;
  select coalesce(sum(amount), 0) into v_supplier
  from public.supplier_purchases
  where business_id = v_business and purchase_date between p_from and p_to;
  select coalesce(sum(amount), 0) into v_recurring
  from public.recurring_expenses
  where business_id = v_business and active;
  select count(*) into v_staff from public.staff where business_id = v_business;
  select count(*) into v_low_stock
  from public.inventory_items
  where business_id = v_business and active and quantity <= minimum_quantity;
  select coalesce(sum(balance), 0) into v_debt
  from public.invoices
  where business_id = v_business and status <> 'paid';
  return jsonb_build_object(
    'sales', v_sales,
    'expenses', v_exp,
    'supplier_spend', v_supplier,
    'recurring_monthly', v_recurring,
    'orders', v_orders,
    'staff', v_staff,
    'low_stock', v_low_stock,
    'debtor_balance', v_debt,
    'estimated_profit', v_sales - v_exp - v_supplier
  );
end;
$fn$;

create or replace function public.generate_monthly_invoice(
  p_customer_id uuid,
  p_period_start date,
  p_period_end date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  c public.customers%rowtype;
  v_invoice uuid;
  v_total numeric := 0;
  rec record;
begin
  perform public.assert_admin();
  select * into c
  from public.customers
  where id = p_customer_id and business_id = public.current_business_id();
  if c.id is null or c.account_type <> 'commercial' then
    raise exception 'Commercial account required';
  end if;
  if p_period_end < p_period_start then
    raise exception 'Invalid invoice period';
  end if;

  insert into public.invoices (
    business_id, customer_id, period_start, period_end, status,
    subtotal, payments_received, balance, due_date, created_by, issued_at
  ) values (
    c.business_id, c.id, p_period_start, p_period_end, 'issued',
    0, 0, 0, p_period_end + greatest(c.payment_terms_days, 0), auth.uid(), now()
  )
  returning id into v_invoice;

  for rec in
    select o.id, o.total,
      greatest(
        o.total
        - coalesce((select sum(p.amount) from public.payments p where p.order_id = o.id), 0)
        + coalesce((select sum(r.amount) from public.refunds r where r.order_id = o.id), 0),
        0
      ) as outstanding
    from public.orders o
    where o.customer_id = c.id
      and o.status <> 'Cancelled'
      and o.created_at::date between p_period_start and p_period_end
      and not exists (select 1 from public.invoice_orders io where io.order_id = o.id)
  loop
    if rec.outstanding > 0 then
      insert into public.invoice_orders (invoice_id, order_id, amount)
      values (v_invoice, rec.id, rec.outstanding);
      v_total := v_total + rec.outstanding;
    end if;
  end loop;

  if v_total <= 0 then
    delete from public.invoices where id = v_invoice;
    raise exception 'No uninvoiced outstanding orders for this period';
  end if;

  update public.invoices set subtotal = v_total, balance = v_total where id = v_invoice;
  return v_invoice;
end;
$fn$;

create or replace function public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_method text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  inv public.invoices%rowtype;
  rec record;
  remaining numeric;
  applied numeric;
  order_paid numeric;
begin
  perform public.assert_admin();
  if p_amount <= 0 or p_method not in ('cash', 'card', 'eft') then
    raise exception 'Invalid payment';
  end if;
  select * into inv
  from public.invoices
  where id = p_invoice_id and business_id = public.current_business_id()
  for update;
  if inv.id is null then raise exception 'Invoice not found'; end if;
  if p_amount > inv.balance then raise exception 'Payment exceeds invoice balance'; end if;

  remaining := p_amount;
  for rec in
    select io.order_id, io.amount
    from public.invoice_orders io
    where io.invoice_id = inv.id
    order by io.order_id
  loop
    exit when remaining <= 0;
    select coalesce(sum(amount), 0) into order_paid
    from public.payments
    where order_id = rec.order_id;
    applied := least(remaining, greatest(rec.amount - order_paid, 0));
    if applied > 0 then
      insert into public.payments (business_id, order_id, amount, method, created_by)
      values (inv.business_id, rec.order_id, applied, p_method, auth.uid());
      remaining := remaining - applied;
    end if;
  end loop;

  insert into public.invoice_payments (invoice_id, business_id, amount, method, created_by)
  values (inv.id, inv.business_id, p_amount, p_method, auth.uid());

  update public.invoices
  set payments_received = payments_received + p_amount,
      balance = balance - p_amount,
      status = case when balance - p_amount <= 0 then 'paid' else 'part_paid' end,
      paid_at = case when balance - p_amount <= 0 then now() else paid_at end,
      payment_method = p_method
  where id = inv.id;
end;
$fn$;

create or replace function public.customer_credit_snapshot(p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  c public.customers%rowtype;
  used numeric;
begin
  perform public.assert_staff();
  select * into c
  from public.customers
  where id = p_customer_id and business_id = public.current_business_id();
  if c.id is null then raise exception 'Customer not found'; end if;
  select coalesce(sum(greatest(
    o.total
    - coalesce((select sum(p.amount) from public.payments p where p.order_id = o.id), 0)
    + coalesce((select sum(r.amount) from public.refunds r where r.order_id = o.id), 0),
    0
  )), 0)
  into used
  from public.orders o
  where o.customer_id = c.id and o.status <> 'Cancelled';
  return jsonb_build_object(
    'account_type', c.account_type,
    'credit_limit', c.credit_limit,
    'used', used,
    'available', greatest(c.credit_limit - used, 0),
    'payment_terms_days', c.payment_terms_days
  );
end;
$fn$;

create or replace function public.refresh_operational_notifications()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  v_business uuid;
  v_count integer;
begin
  v_business := public.assert_staff();
  delete from public.notifications
  where business_id = v_business
    and kind in ('overdue', 'ready_waiting')
    and status = 'open';
  insert into public.notifications (
    business_id, branch_id, customer_id, order_id, kind, title, body, priority, due_at
  )
  select o.business_id, o.branch_id, o.customer_id, o.id, 'overdue',
    'Overdue order', 'Order #' || o.order_number || ' is past its due date', 'high', o.due_date::timestamptz
  from public.orders o
  where o.business_id = v_business
    and o.status not in ('Collected', 'Cancelled', 'Ready')
    and o.due_date < current_date;
  insert into public.notifications (
    business_id, branch_id, customer_id, order_id, kind, title, body, priority
  )
  select o.business_id, o.branch_id, o.customer_id, o.id, 'ready_waiting',
    'Collection reminder', 'Order #' || o.order_number || ' is ready for collection', 'normal'
  from public.orders o
  where o.business_id = v_business and o.status = 'Ready';
  select count(*) into v_count
  from public.notifications
  where business_id = v_business and status = 'open';
  return v_count;
end;
$fn$;

create or replace function public.mark_whatsapp_sent(p_queue_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
begin
  perform public.assert_staff();
  update public.whatsapp_queue
  set status = 'sent', sent_at = now(), attempts = attempts + 1
  where id = p_queue_id and business_id = public.current_business_id();
  if not found then
    raise exception 'Message not found';
  end if;
end;
$fn$;

create or replace function public.queue_whatsapp_for_order(p_order_id uuid, p_template text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  o record;
  v_id uuid;
  v_msg text;
  v_shop text;
begin
  perform public.assert_staff();
  select o.id, o.business_id, o.customer_id, o.order_number, o.total, c.name, c.phone
  into o
  from public.orders o
  join public.customers c on c.id = o.customer_id
  where o.id = p_order_id and o.business_id = public.current_business_id();
  if o.id is null then raise exception 'Order not found'; end if;

  select coalesce(nullif(trim(bs.message_name), ''), b.name, 'your dry cleaner')
  into v_shop
  from public.businesses b
  left join public.business_settings bs on bs.business_id = b.id
  where b.id = o.business_id;

  if p_template = 'received' then
    v_msg := format('Hi %s, %s has received your order #%s. Thank you.', o.name, v_shop, o.order_number);
  elsif p_template = 'ready' then
    v_msg := format('Hi %s, your %s order #%s is ready for collection.', o.name, v_shop, o.order_number);
  elsif p_template = 'reminder' then
    v_msg := format('Hi %s, a friendly reminder that %s order #%s is ready for collection.', o.name, v_shop, o.order_number);
  else
    raise exception 'Unknown WhatsApp template';
  end if;

  insert into public.whatsapp_queue (
    business_id, customer_id, order_id, phone, template_key, message, status
  ) values (
    o.business_id, o.customer_id, o.id, o.phone, p_template, v_msg, 'pending'
  )
  returning id into v_id;
  return v_id;
end;
$fn$;

-- Trigger only. Uses the shop's own name, and the WhatsApp on/off switches.
create or replace function public.auto_queue_order_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  c record;
  msg text;
  v_shop text;
  v_received boolean;
  v_ready boolean;
begin
  select name, phone into c from public.customers where id = new.customer_id;
  select coalesce(nullif(trim(bs.message_name), ''), b.name, 'your dry cleaner')
  into v_shop
  from public.businesses b
  left join public.business_settings bs on bs.business_id = b.id
  where b.id = new.business_id;
  select
    coalesce(bs.whatsapp_received_enabled, true),
    coalesce(bs.whatsapp_ready_enabled, true)
  into v_received, v_ready
  from public.business_settings bs
  where bs.business_id = new.business_id;
  v_received := coalesce(v_received, true);
  v_ready := coalesce(v_ready, true);

  if tg_op = 'INSERT' and v_received then
    msg := format('Hi %s, %s has received your order #%s. Thank you.', c.name, v_shop, new.order_number);
    insert into public.whatsapp_queue (
      business_id, customer_id, order_id, phone, template_key, message, status
    ) values (
      new.business_id, new.customer_id, new.id, c.phone, 'received', msg, 'pending'
    );
  elsif tg_op = 'UPDATE' and new.status = 'Ready' and old.status is distinct from new.status and v_ready then
    msg := format('Hi %s, your %s order #%s is ready for collection.', c.name, v_shop, new.order_number);
    insert into public.whatsapp_queue (
      business_id, customer_id, order_id, phone, template_key, message, status
    ) values (
      new.business_id, new.customer_id, new.id, c.phone, 'ready', msg, 'pending'
    );
  end if;
  return new;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Direct table writes must not bypass the role checks above.
-- Security-definer functions run as postgres and are allowed through.
-- A signed-in request runs as "authenticated" and is checked.
-- ---------------------------------------------------------------------------

create or replace function public.guard_business_counters()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $fn$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if new.id is distinct from old.id or new.next_order_number is distinct from old.next_order_number then
    raise exception 'This business field cannot be changed from the app';
  end if;
  return new;
end;
$fn$;

drop trigger if exists businesses_guard_counters on public.businesses;
create trigger businesses_guard_counters
before update on public.businesses
for each row execute function public.guard_business_counters();

create or replace function public.guard_order_sensitive_columns()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $fn$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  -- Money columns move only through the till functions, which run as the
  -- function owner. Status, due date and notes stay editable by staff.
  if new.business_id is distinct from old.business_id
     or new.order_number is distinct from old.order_number
     or new.total is distinct from old.total
     or new.discount_amount is distinct from old.discount_amount
     or new.discount_reason is distinct from old.discount_reason
     or new.discount_by is distinct from old.discount_by
     or new.deposit_required is distinct from old.deposit_required
     or new.payment_status is distinct from old.payment_status
     or new.customer_id is distinct from old.customer_id then
    raise exception 'This order field cannot be changed from the app';
  end if;
  return new;
end;
$fn$;

drop trigger if exists orders_guard_sensitive on public.orders;
create trigger orders_guard_sensitive
before update on public.orders
for each row execute function public.guard_order_sensitive_columns();

create or replace function public.guard_order_item_price()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $fn$
begin
  if current_user in ('postgres', 'supabase_admin') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Change prices through the till. Price overrides require an owner or admin.';
  end if;
  if tg_op = 'UPDATE'
     and new.unit_price is not distinct from old.unit_price
     and new.quantity is not distinct from old.quantity
     and new.order_id is not distinct from old.order_id then
    return new;
  end if;
  raise exception 'Change prices through the till. Price overrides require an owner or admin.';
end;
$fn$;

drop trigger if exists order_items_guard_price on public.order_items;
create trigger order_items_guard_price
before insert or update or delete on public.order_items
for each row execute function public.guard_order_item_price();

create or replace function public.guard_customer_account()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $fn$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.business_id is distinct from old.business_id then
    raise exception 'A customer cannot be moved to another business';
  end if;
  if coalesce(public.current_staff_role(), '') in ('owner', 'admin') then
    return new;
  end if;
  if tg_op = 'INSERT' and (
    coalesce(new.account_type, 'retail') <> 'retail'
    or coalesce(new.credit_limit, 0) <> 0
    or coalesce(new.payment_terms_days, 0) <> 0
  ) then
    raise exception 'Owner or admin access required';
  end if;
  if tg_op = 'UPDATE' and (
    new.account_type is distinct from old.account_type
    or new.credit_limit is distinct from old.credit_limit
    or new.payment_terms_days is distinct from old.payment_terms_days
    or new.vat_number is distinct from old.vat_number
    or new.billing_name is distinct from old.billing_name
    or new.billing_address is distinct from old.billing_address
  ) then
    raise exception 'Owner or admin access required';
  end if;
  return new;
end;
$fn$;

drop trigger if exists customers_guard_account on public.customers;
create trigger customers_guard_account
before insert or update on public.customers
for each row execute function public.guard_customer_account();

-- Owners can rename their own shop. The counter column is protected above.
drop policy if exists "owner can update business" on public.businesses;
create policy "owner can update business"
on public.businesses
for update to authenticated
using (id = public.current_business_id() and public.current_staff_role() in ('owner', 'admin'))
with check (id = public.current_business_id() and public.current_staff_role() in ('owner', 'admin'));

-- Cash-up close is an owner/admin action. Reading the till stays open to staff.
drop policy if exists "staff can create cashups" on public.cashups;
drop policy if exists "staff can update cashups" on public.cashups;
drop policy if exists "admin can create cashups" on public.cashups;
drop policy if exists "admin can update cashups" on public.cashups;
create policy "admin can create cashups"
on public.cashups
for insert to authenticated
with check (
  business_id = public.current_business_id()
  and public.current_staff_role() in ('owner', 'admin')
);
create policy "admin can update cashups"
on public.cashups
for update to authenticated
using (
  business_id = public.current_business_id()
  and public.current_staff_role() in ('owner', 'admin')
)
with check (
  business_id = public.current_business_id()
  and public.current_staff_role() in ('owner', 'admin')
);

-- Stock changes are owner/admin. Staff can still see quantities.
drop policy if exists "staff inventory write" on public.inventory_items;
drop policy if exists "admin inventory write" on public.inventory_items;
create policy "admin inventory write"
on public.inventory_items
for all to authenticated
using (
  business_id = public.current_business_id()
  and public.current_staff_role() in ('owner', 'admin')
)
with check (
  business_id = public.current_business_id()
  and public.current_staff_role() in ('owner', 'admin')
);

drop policy if exists "staff inventory movements" on public.inventory_movements;
drop policy if exists "staff inventory movements read" on public.inventory_movements;
drop policy if exists "admin inventory movements write" on public.inventory_movements;
create policy "staff inventory movements read"
on public.inventory_movements
for select to authenticated
using (business_id = public.current_business_id());
create policy "admin inventory movements write"
on public.inventory_movements
for all to authenticated
using (
  business_id = public.current_business_id()
  and public.current_staff_role() in ('owner', 'admin')
)
with check (
  business_id = public.current_business_id()
  and public.current_staff_role() in ('owner', 'admin')
);

-- Payments are written by the till functions, which check the balance.
-- A direct insert could mark money that was never received.
drop policy if exists "staff can manage payments" on public.payments;
drop policy if exists "staff can read payments" on public.payments;
create policy "staff can read payments"
on public.payments
for select to authenticated
using (business_id = public.current_business_id());

-- ---------------------------------------------------------------------------
-- Grants.
-- anon (signed out) gets nothing.
-- PUBLIC gets nothing, so a new role does not inherit execute.
-- authenticated gets the functions the signed-in app actually calls,
-- plus the three helpers used by row level security.
-- Trigger functions, the retired catalogue, and the internal helpers are
-- not callable through /rest/v1/rpc at all.
-- ---------------------------------------------------------------------------

do $fn$
declare
  r record;
  v_app text[] := array[
    'accept_quote_to_order',
    'admin_dashboard',
    'apply_order_discount',
    'bootstrap_business',
    'cancel_order',
    'close_daily_cashup',
    'confirm_order_collection',
    'create_order',
    'create_quote',
    'current_branch_id',
    'current_business_id',
    'current_staff_role',
    'customer_credit_snapshot',
    'generate_monthly_invoice',
    'inventory_adjust',
    'mark_whatsapp_sent',
    'override_order_item_price',
    'owner_business_snapshot',
    'queue_whatsapp_for_order',
    'record_invoice_payment',
    'record_order_payment',
    'record_order_refund',
    'refresh_operational_notifications',
    'set_order_deposit',
    'update_order_details'
  ];
  v_hidden text[] := array[
    'assert_admin',
    'assert_staff',
    'audit_payment_insert',
    'audit_service_price_change',
    'auto_queue_order_whatsapp',
    'guard_business_counters',
    'guard_customer_account',
    'guard_order_item_price',
    'guard_order_sensitive_columns',
    'install_starter_catalog',
    'install_superkleen_catalog',
    'log_audit',
    'log_order_status_change',
    'normalize_customer_phone',
    'rls_auto_enable'
  ];
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    if r.proname = any (v_hidden) then
      execute format('revoke all on function %s from service_role', r.sig);
    else
      execute format('grant execute on function %s to service_role', r.sig);
    end if;
    if r.proname = any (v_app) then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
    if r.proname <> 'rls_auto_enable' then
      execute format('alter function %s set search_path = pg_catalog, public, pg_temp', r.sig);
    end if;
  end loop;
end;
$fn$;

revoke all on all tables in schema public from anon, public;
revoke all on all sequences in schema public from anon, public;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, public;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, public;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, public;
