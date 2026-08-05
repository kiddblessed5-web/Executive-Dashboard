-- ============================================================
-- SAGERO CREATIONS — Orders (replaces the never-built Customers/CRM page)
-- ============================================================
-- Designed so that when you build a real storefront website
-- later, its checkout page can insert directly into this SAME
-- table via Supabase's REST API — no extra backend needed on
-- that site. That's why the insert policy below allows anonymous
-- (not-logged-in) inserts: real customers checking out on a public
-- website won't have an admin login. Reading/managing orders still
-- requires being signed into this app.
-- ============================================================

create table if not exists orders (
  id text primary key,                 -- e.g. 'ORD-7001'
  customer_name text not null,
  customer_phone text,
  customer_email text,
  items jsonb not null default '[]',   -- [{name, qty, unit_price}]
  total numeric(12,2) not null default 0,
  status text not null default 'Pending' check (status in ('Pending','Processing','Shipped','Delivered','Cancelled')),
  payment_status text not null default 'Unpaid' check (payment_status in ('Unpaid','Paid','Refunded')),
  payment_method text,                 -- e.g. 'M-Pesa', 'Cash', 'Card' — free text for now
  source text not null default 'Manual' check (source in ('Manual','Website')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_orders_updated_at on orders;
create trigger trg_orders_updated_at before update on orders for each row execute function set_updated_at();

create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_created on orders(created_at desc);

alter table orders enable row level security;

-- Reading and managing orders requires being signed into the app
create policy "Authenticated users can read orders" on orders for select using (auth.role() = 'authenticated');
create policy "Authenticated users can update orders" on orders for update using (auth.role() = 'authenticated');
create policy "Authenticated users can delete orders" on orders for delete using (auth.role() = 'authenticated');

-- Both signed-in admin users (adding an order manually) AND anonymous
-- visitors (a future storefront's checkout, where the customer isn't
-- logged into anything) can create an order.
create policy "Anyone can place an order" on orders for insert with check (true);

alter publication supabase_realtime add table orders;
