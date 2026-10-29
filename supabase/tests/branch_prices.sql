-- Branch price check.
-- Run this AFTER supabase/migrations/20261030_branch_service_prices.sql.
-- Run the whole script in the Supabase SQL editor. It rolls back.
-- A passing run ends with the notice: branch price checks passed.
-- If it raises, run rollback; so the editor does not keep the transaction open.

begin;

do $test$
declare
  v_instance uuid;
  v_owner uuid := '44444444-4444-4444-8444-444444444444';
  v_staff uuid := '55555555-5555-4555-8555-555555555555';
  v_other uuid := '66666666-6666-4666-8666-666666666666';
  v_biz uuid;
  v_other_biz uuid;
  v_branch_a uuid;
  v_branch_b uuid;
  v_other_branch uuid;
  v_shirt uuid;
  v_trousers uuid;
  v_order uuid;
  v_quote uuid;
  v_total numeric;
  v_price numeric;
  n integer;
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
    (v_instance, v_owner, 'authenticated', 'authenticated', 'ff-branch-owner@example.com', 'x',
     now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
     now(), now(), 'ff-branch-owner-confirm', 'ff-branch-owner-recover', '', ''),
    (v_instance, v_staff, 'authenticated', 'authenticated', 'ff-branch-staff@example.com', 'x',
     now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
     now(), now(), 'ff-branch-staff-confirm', 'ff-branch-staff-recover', '', ''),
    (v_instance, v_other, 'authenticated', 'authenticated', 'ff-branch-other@example.com', 'x',
     now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
     now(), now(), 'ff-branch-other-confirm', 'ff-branch-other-recover', '', '');

  insert into public.businesses (name) values ('Branch Price Shop') returning id into v_biz;
  insert into public.businesses (name) values ('Other Price Shop') returning id into v_other_biz;
  insert into public.branches (business_id, name) values (v_biz, 'Sea Point') returning id into v_branch_a;
  insert into public.branches (business_id, name) values (v_biz, 'Claremont') returning id into v_branch_b;
  insert into public.branches (business_id, name) values (v_other_biz, 'Other') returning id into v_other_branch;

  insert into public.staff (id, business_id, branch_id, full_name, role)
  values (v_owner, v_biz, v_branch_a, 'Owner', 'owner');
  insert into public.staff (id, business_id, branch_id, full_name, role)
  values (v_staff, v_biz, v_branch_a, 'Counter', 'staff');
  insert into public.staff (id, business_id, branch_id, full_name, role)
  values (v_other, v_other_biz, v_other_branch, 'Other owner', 'owner');

  insert into public.services (business_id, name, item_name, category, unit, price, active)
  values (v_biz, 'Shirt', 'Shirt', 'Dry-cleaning', 'item', 45, true)
  returning id into v_shirt;
  insert into public.services (business_id, name, item_name, category, unit, price, active)
  values (v_biz, 'Trousers', 'Trousers', 'Dry-cleaning', 'item', 55, true)
  returning id into v_trousers;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  execute 'set local role authenticated';

  -- No override yet. A fake client price must not stick. Sea Point charges 45.
  v_order := public.create_order(
    null, 'Customer A', '0820000201', current_date, null,
    jsonb_build_array(jsonb_build_object(
      'service_id', v_shirt, 'description', 'Shirt', 'quantity', 1, 'unit_price', 1
    )),
    null
  );
  select total into v_total from public.orders where id = v_order;
  select unit_price into v_price from public.order_items where order_id = v_order;
  if v_total is distinct from 45 or v_price is distinct from 45 then
    raise exception 'Sea Point charged % / % instead of the shop price 45', v_total, v_price;
  end if;

  execute 'reset role';

  insert into public.branch_service_prices (business_id, branch_id, service_id, price, active)
  values (v_biz, v_branch_b, v_shirt, 60, true);
  insert into public.branch_service_prices (business_id, branch_id, service_id, price, active)
  values (v_biz, v_branch_b, v_trousers, 55, false);
  update public.staff set branch_id = v_branch_b where id = v_owner;

  execute 'set local role authenticated';

  v_order := public.create_order(
    null, 'Customer B', '0820000202', current_date, null,
    jsonb_build_array(jsonb_build_object(
      'service_id', v_shirt, 'description', 'Shirt', 'quantity', 2, 'unit_price', 45
    )),
    null
  );
  select total into v_total from public.orders where id = v_order;
  select unit_price into v_price from public.order_items where order_id = v_order;
  if v_total is distinct from 120 or v_price is distinct from 60 then
    raise exception 'Claremont charged % / % instead of the branch price 60', v_total, v_price;
  end if;

  begin
    perform public.create_order(
      null, 'Customer B', '0820000202', current_date, null,
      jsonb_build_array(jsonb_build_object(
        'service_id', v_trousers, 'description', 'Trousers', 'quantity', 1, 'unit_price', 55
      )),
      null
    );
    raise exception 'hidden service was sold at Claremont';
  exception
    when others then
      if sqlerrm not ilike '%not available%' then
        raise;
      end if;
  end;

  select id into v_quote from public.customers
  where business_id = v_biz and normalized_phone = '0820000202';
  v_quote := public.create_quote(
    v_quote, current_date + 7, null, 0,
    jsonb_build_array(jsonb_build_object(
      'service_id', v_shirt, 'description', 'Shirt', 'quantity', 1, 'unit_price', 1
    ))
  );
  select total into v_total from public.quotes where id = v_quote;
  select unit_price into v_price from public.quote_items where quote_id = v_quote;
  if v_total is distinct from 60 or v_price is distinct from 60 then
    raise exception 'quote used % / % instead of the branch price 60', v_total, v_price;
  end if;

  execute 'reset role';

  -- Sea Point staff cannot see Claremont's override.
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_staff::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.branch_service_prices;
  if n <> 0 then
    raise exception 'Sea Point staff saw % branch prices', n;
  end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_other::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.branch_service_prices;
  if n <> 0 then
    raise exception 'another shop saw % branch prices', n;
  end if;
  begin
    insert into public.branch_service_prices (business_id, branch_id, service_id, price, active)
    values (v_other_biz, v_other_branch, v_shirt, 1, true);
    raise exception 'another shop priced a service it does not own';
  exception
    when others then
      if sqlerrm not ilike '%does not belong%' then
        raise;
      end if;
  end;
  execute 'reset role';

  select price into v_price from public.services where id = v_shirt;
  if v_price is distinct from 45 then
    raise exception 'shop shirt price changed to %', v_price;
  end if;
  select price into v_price from public.services where id = v_trousers;
  if v_price is distinct from 55 then
    raise exception 'shop trouser price changed to %', v_price;
  end if;

  raise notice 'branch price checks passed';
end;
$test$;

rollback;
