-- FreshFlow branch printer routing
create table if not exists public.branch_printer_routes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  route text not null check (route in ('receipt','report')),
  printer_name text not null default '',
  paper_size text not null default 'A4' check (paper_size in ('80mm','A4')),
  print_mode text not null default 'browser' check (print_mode in ('browser','agent')),
  agent_url text not null default 'http://127.0.0.1:17891',
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (business_id, branch_id, route)
);

alter table public.branch_printer_routes enable row level security;

create policy "staff printer routes read"
on public.branch_printer_routes for select to authenticated
using (business_id = public.current_business_id() and branch_id = public.current_branch_id());

create policy "admin printer routes write"
on public.branch_printer_routes for all to authenticated
using (
  business_id = public.current_business_id()
  and branch_id = public.current_branch_id()
  and public.current_staff_role() in ('owner','admin')
)
with check (
  business_id = public.current_business_id()
  and branch_id = public.current_branch_id()
  and public.current_staff_role() in ('owner','admin')
);

grant select on public.branch_printer_routes to authenticated;
grant insert, update, delete on public.branch_printer_routes to authenticated;

create index if not exists branch_printer_routes_lookup_idx
on public.branch_printer_routes (business_id, branch_id, route);
