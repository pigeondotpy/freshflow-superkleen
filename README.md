# FreshFlow

Counter software for dry cleaners. Each shop has its own name, receipt, prices, customers and orders.

The app is static HTML and JavaScript, backed by Supabase Auth and PostgreSQL, and hosted on Vercel.

## Apply the database changes

Do this in the Supabase SQL editor for project `qyqokcayqtapiaktszbv`. Run each file once, as a whole script. Do not deploy from this repository until the script has been applied.

1. `supabase/migrations/20260822_v05_cashup.sql` if cash-up has never been installed.
2. `supabase/20260922_printer_routing.sql` if printer routing has never been installed.
3. `supabase/migrations/20261029_tenant_security_and_branding.sql` for shop isolation, locked-down functions, and per-shop branding.
4. `supabase/migrations/20261030_branch_service_prices.sql` for a different price, or a hidden item, at one branch. Branches with no row keep the shop price.
5. `supabase/migrations/20261029b_restore_cashup_refund_netting.sql` so cash-up expected takings subtract refunds. Already applied on the live database.

Then run `supabase/tests/tenant_isolation.sql` and `supabase/tests/branch_prices.sql`. Each rolls back. They should finish with `tenant isolation checks passed` and `branch price checks passed`.

Leaked-password protection is a switch in Authentication settings. This repository cannot turn it on. See `SECURITY.md`.

## Shops

The signed-out screen is FreshFlow. The first person who creates a shop becomes its owner and gets a starter South African price list they can edit. An existing shop keeps the prices and receipt wording already stored for it.
