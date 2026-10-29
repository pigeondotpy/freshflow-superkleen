# FreshFlow security review

Reviewed against the live project `qyqokcayqtapiaktszbv` on 29 October 2026. The SQL in `supabase/migrations/20261029_tenant_security_and_branding.sql` is the fix. It has not been applied to the live database.

## How a signed-out visitor was locked out

The anon key is in the browser. That is normal for Supabase. What was not normal is that `anon` could execute every security-definer function in `public`, and had full table grants. Row level security has no policies for `anon`, so a direct table read already returned nothing. The functions were the hole, because a security-definer function bypasses row level security.

| Finding | Severity | Change |
| --- | --- | --- |
| 32 security-definer functions executable by `anon` and by `PUBLIC` | Critical | `EXECUTE` revoked from `anon` and `PUBLIC` on every public function. Signed-out calls fail with permission denied. |
| Trigger functions callable over `/rest/v1/rpc`: `audit_payment_insert`, `audit_service_price_change`, `auto_queue_order_whatsapp`, `log_order_status_change`, `normalize_customer_phone` | High | Execute revoked from `anon`, `authenticated`, and `service_role`. Triggers still fire. |
| `rls_auto_enable` and `install_superkleen_catalog` callable by app users | High | Execute revoked from app roles. The catalogue function now only raises "retired". Superkleen's existing price rows are not modified. |
| `log_audit`, `assert_staff`, `assert_admin`, `install_starter_catalog`, and the guard triggers callable as RPCs | Medium | Execute revoked. Other functions call them as the function owner. |
| New functions were going to be granted to `anon` automatically | Medium | Default privileges for `postgres` in `public` no longer grant table, sequence, or function access to `anon`. New functions are also not granted to `authenticated` until a migration says so. |
| Leaked-password protection is off | Medium | Not changed. In the Supabase dashboard open Authentication, then Password, and turn on leaked-password protection. HaveIBeenPwned then rejects known leaked passwords. |

## How one shop could reach another shop

Row level security is enabled on every public table, and the policies compare `business_id` to `current_business_id()`. Insert and update checks do the same, including `order_items`, `quote_items`, and `invoice_orders`. There is no policy for `anon`. That part was already in good shape.

The leaks were inside security-definer functions. Several of them used `if role not in ('owner','admin')` and `if business_id <> current_business_id()`. When the caller has no staff row, both the role and the business id are null. In SQL, `null not in (...)` and `uuid <> null` are null, and a null `if` does not raise. The function then continued as the table owner and ignored row level security.

| Finding | Severity | Change |
| --- | --- | --- |
| `confirm_order_collection` and `set_order_deposit` updated any order id when the caller had no business | Critical | Both require a staff row, and compare the business with `is distinct from`, which treats null as "not this shop". |
| `apply_order_discount` and `override_order_item_price` skipped the admin check when the role was null, then updated any order | Critical | Both call `assert_admin()` first. A null role is rejected. |
| `admin_dashboard`, `owner_business_snapshot`, and `generate_monthly_invoice` had the same null-role check. A caller with no business got empty numbers rather than another shop's rows, but a staff member was the only case that was actually blocked | High | All three call `assert_admin()`. |
| `record_invoice_payment` had no role check. Any staff member of that shop could record an invoice payment | High | Requires owner or admin. The screen was already hidden for other roles. |
| `inventory_adjust` had no role check, and the stock tables allowed any staff member to write | High | The function requires owner or admin. Table policies for stock items and movements now match. Staff can still read stock. |
| `close_daily_cashup` had no role check, and any staff member could insert a cash-up row directly | High | The function and the insert/update policies require owner or admin. Staff can still read the day's takings. |
| `create_order` and `create_quote` trusted the price sent by the browser, so any staff member could undercharge | High | A staff sale must use the current price-list price. Owners and admins can still override, and the override is written to the audit log. A quote discount above zero requires owner or admin. |
| Direct updates could change an order total, a payment status, or an item price without the functions above | High | Triggers block those column changes, and block item quantity and price changes, unless the statement is running inside a security-definer function (the till). Staff can still change status, due date and notes. Payments can no longer be inserted straight into the table. |
| Any staff member could set a customer's credit limit | Medium | Credit limit, account type, payment terms, and billing details require owner or admin. |
| An owner could not rename the business, because `businesses` had no update policy | Medium | Owners and admins can update their own business row. A trigger stops them changing the next order number. |
| `search_path` on definer functions was `public` only. A temporary table in the session is searched before `public` unless `pg_temp` is listed | Medium | Definer functions now use `search_path = pg_catalog, public, pg_temp`, which keeps the temporary schema last. `rls_auto_enable` stays on `pg_catalog`. |
| `queue_whatsapp_for_order` and the WhatsApp trigger wrote the name "Superkleen" into every shop's messages | Medium | They use that shop's message name, then its business name. Superkleen's message name is set to `Superkleen`, so its wording stays the same. The on/off switches in business settings are honoured. |

`current_business_id()`, `current_branch_id()`, and `current_staff_role()` stay security definer. Row level security has to read the caller's own staff row before it knows which business they belong to. They return only that caller's id or role. `authenticated` can execute them. `anon` cannot.

Signed-in functions the app still calls: `bootstrap_business`, `create_order`, `create_quote`, `accept_quote_to_order`, `record_order_payment`, `update_order_details`, `cancel_order`, `record_order_refund`, `confirm_order_collection`, `set_order_deposit`, `close_daily_cashup`, `apply_order_discount`, `override_order_item_price`, `inventory_adjust`, `admin_dashboard`, `owner_business_snapshot`, `generate_monthly_invoice`, `record_invoice_payment`, `customer_credit_snapshot`, `refresh_operational_notifications`, `queue_whatsapp_for_order`, `mark_whatsapp_sent`.

`bootstrap_business` is authenticated only. It refuses to run signed out, and if the person already has a staff row it returns that business and does not create another one or replace prices.

## What the isolation test checks

`supabase/tests/tenant_isolation.sql` creates two throwaway shops inside a transaction, then rolls back. It checks:

- shop A sees its own order and customer, and not shop B's
- shop A cannot update shop B's order or customer
- a staff member cannot apply a discount
- `anon` cannot read `orders` or `customers`
- `anon` cannot call `create_order`, `admin_dashboard`, `bootstrap_business`, or `install_superkleen_catalog`

Run it in the SQL editor after the migration. You should see `tenant isolation checks passed`. If a check fails, the script raises and the transaction aborts. Run `rollback;` if the editor is still holding the transaction open. Nothing is kept.

## Branding

Shop name, receipt heading, subtitle, address, phone, VAT number, footer, logo link, and the WhatsApp name live on `businesses` and `business_settings`. Superkleen's receipt heading is filled in as `SUPERKLEEN`, the subtitle as `DRY CLEANERS`, and the footer is the one already stored (`Thank you for choosing Superkleen.`). Its 438 price rows are not rewritten.

A new shop gets a starter list (shirts, suits, duvets, laundry per kilo, pressing, alterations, shoes, leather, housekeeping). The owner edits prices and can add items. The old "sync catalogue" button, which copied Superkleen's list onto any shop with fewer than 100 services, is gone.

The signed-out screen says FreshFlow. After sign-in, the header and the slip use that shop's settings.

Saved favourite stars stay in this browser under the existing storage key, so Superkleen's counter does not lose them. The key is not shown on screen.

## Not verified here

- The migration was not executed on the live database, and the app was not deployed.
- Sign-in as the Superkleen owner was not available in this session, so the live receipt was not printed from production data. The receipt markup was checked in a browser with a second shop's settings, and with Superkleen's stored heading.
- Email confirmation for new sign-ups depends on the Auth setting. If confirmation is on, the shop is created on the first sign-in, from the details they typed. Those details are stored as sign-up metadata so they survive the email round trip. They are not used to decide which existing shop someone belongs to.
- There is still no way to add a second staff login to a shop from the app. The first account is the owner. A later account that signs up gets its own shop, not Superkleen's.
- Quick Docket (pull request 1, branch `cursor/quick-docket-d9d0`) is not merged. It does not change the database. It does set the browser title to Superkleen in `quick-docket.js`, and it stores counter pins under a `superkleen_quick_pins_` key. This branch only changes the config object in `config.js`, not the script loader that Quick Docket edits, so the two should merge. After that merge, the Quick Docket title should use the shop name.
