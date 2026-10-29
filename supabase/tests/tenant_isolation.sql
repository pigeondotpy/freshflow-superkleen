-- FreshFlow tenant isolation check.
-- Run this AFTER supabase/migrations/20261029_tenant_security_and_branding.sql.
-- Run the whole script in the Supabase SQL editor. It rolls back.
-- A passing run ends with the notice: tenant isolation checks passed.
-- If it raises, run rollback; so the editor does not keep the transaction open.

begin;

do $test$
declare
  v_instance uuid;
  v_user_a uuid := '11111111-1111-4111-8111-111111111111';
  v_user_b uuid := '22222222-2222-4222-8222-222222222222';
  v_user_staff uuid := '33333333-3333-4333-8333-333333333333';
  v_biz_a uuid;
  v_biz_b uuid;
  v_branch_a uuid;
  v_branch_b uuid;
  v_customer_a uuid;
  v_customer_b uuid;
  v_order_a uuid;
  v_order_b uuid;
  v_service_a uuid;
  n integer;
  v_name text;
begin
  select coalesce(
    (select instance_id from auth.users where instance_id is not null limit 1),
    '00000000-0000-0000-0000-000000000000'::uuid
  ) into v_instance;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values
    (v_instance, v_user_a, 'authenticated', 'authenticated', 'ff-isolation-a@example.com', 'x',
     now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
     now(), now(), 'ff-isolation-a-confirm', 'ff-isolation-a-recover', '', ''),
    (v_instance, v_user_b, 'authenticated', 'authenticated', 'ff-isolation-b@example.com', 'x',
     now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
     now(), now(), 'ff-isolation-b-confirm', 'ff-isolation-b-recover', '', ''),
    (v_instance, v_user_staff, 'authenticated', 'authenticated', 'ff-isolation-staff@example.com', 'x',
     now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
     now(), now(), 'ff-isolation-staff-confirm', 'ff-isolation-staff-recover', '', '');

  insert into public.businesses (name) values ('Isolation Shop A') returning id into v_biz_a;
  insert into public.businesses (name) values ('Isolation Shop B') returning id into v_biz_b;
  insert into public.branches (business_id, name) values (v_biz_a, 'A') returning id into v_branch_a;
  insert into public.branches (business_id, name) values (v_biz_b, 'B') returning id into v_branch_b;

  insert into public.staff (id, business_id, branch_id, full_name, role)
  values (v_user_a, v_biz_a, v_branch_a, 'Owner A', 'owner');
  insert into public.staff (id, business_id, branch_id, full_name, role)
  values (v_user_b, v_biz_b, v_branch_b, 'Owner B', 'owner');
  insert into public.staff (id, business_id, branch_id, full_name, role)
  values (v_user_staff, v_biz_a, v_branch_a, 'Counter A', 'staff');

  insert into public.customers (business_id, name, phone)
  values (v_biz_a, 'Customer A', '0820000001') returning id into v_customer_a;
  insert into public.customers (business_id, name, phone)
  values (v_biz_b, 'Customer B', '0820000002') returning id into v_customer_b;

  insert into public.services (business_id, name, item_name, category, unit, price, active)
  values (v_biz_a, 'Shirt', 'Shirt', 'Dry-cleaning', 'item', 45, true)
  returning id into v_service_a;

  insert into public.orders (business_id, branch_id, customer_id, order_number, due_date, total)
  values (v_biz_a, v_branch_a, v_customer_a, 990001, current_date, 45)
  returning id into v_order_a;
  insert into public.orders (business_id, branch_id, customer_id, order_number, due_date, total)
  values (v_biz_b, v_branch_b, v_customer_b, 990002, current_date, 80)
  returning id into v_order_b;

  -- Shop A, signed in.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  execute 'set local role authenticated';

  if public.current_business_id() is distinct from v_biz_a then
    raise exception 'current_business_id did not return shop A';
  end if;

  select count(*) into n from public.orders;
  if n <> 1 then
    raise exception 'shop A saw % orders, expected 1', n;
  end if;
  select count(*) into n from public.customers;
  if n <> 1 then
    raise exception 'shop A saw % customers, expected 1', n;
  end if;
  select count(*) into n from public.orders where id = v_order_b;
  if n <> 0 then
    raise exception 'shop A can see shop B order';
  end if;
  select count(*) into n from public.customers where id = v_customer_b;
  if n <> 0 then
    raise exception 'shop A can see shop B customer';
  end if;

  update public.orders set status = 'Ready' where id = v_order_b;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'shop A updated shop B order';
  end if;

  update public.customers set name = 'taken' where id = v_customer_b;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'shop A updated shop B customer';
  end if;

  begin
    perform public.create_order(
      v_customer_b, 'Customer B', '0820000002', current_date, null,
      jsonb_build_array(jsonb_build_object(
        'service_id', v_service_a, 'description', 'Shirt', 'quantity', 1, 'unit_price', 45
      )),
      null
    );
    raise exception 'shop A created an order for shop B customer';
  exception
    when others then
      if sqlerrm not ilike '%not found%' and sqlerrm not ilike '%does not belong%' then
        raise;
      end if;
  end;

  -- A counter staff member of shop A cannot discount.
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_staff, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user_staff::text, true);
  begin
    perform public.apply_order_discount(v_order_a, 5, 'test');
    raise exception 'staff member applied a discount';
  exception
    when insufficient_privilege then
      raise exception 'staff member was denied the discount function entirely';
    when others then
      if sqlerrm not ilike '%owner or admin%' then
        raise;
      end if;
  end;

  execute 'reset role';

  -- Signed out.
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';

  begin
    select count(*) into n from public.orders;
    raise exception 'anon read orders (% rows)', n;
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    select count(*) into n from public.customers;
    raise exception 'anon read customers (% rows)', n;
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    perform public.create_order(
      null, 'Walk in', '0820000003', current_date, null,
      jsonb_build_array(jsonb_build_object('description', 'Shirt', 'quantity', 1, 'unit_price', 1)),
      null
    );
    raise exception 'anon called create_order';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    perform public.admin_dashboard(current_date, current_date);
    raise exception 'anon called admin_dashboard';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    perform public.bootstrap_business('Stolen Shop', 'Anon');
    raise exception 'anon called bootstrap_business';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    perform public.install_superkleen_catalog();
    raise exception 'anon called install_superkleen_catalog';
  exception
    when insufficient_privilege then
      null;
  end;

  execute 'reset role';
  select name into v_name from public.businesses where id = v_biz_b;
  if v_name is distinct from 'Isolation Shop B' then
    raise exception 'shop B name changed during the test';
  end if;

  raise notice 'tenant isolation checks passed';
end;
$test$;

rollback;
