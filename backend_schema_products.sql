-- ============================================================
-- SAGERO CREATIONS — Storefront products
-- ============================================================
-- Separate from accessories_stock (which tracks internal shop
-- inventory levels) — this is the public-facing catalog: what
-- shows on the actual selling website, with the pricing and
-- descriptions a customer needs, none of which belongs on the
-- internal inventory table.
--
-- Anyone can READ this (customers browsing aren't logged into
-- anything) — only signed-in admins can add/edit/remove products.
-- ============================================================

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(10,2) not null default 0,
  compare_at_price numeric(10,2),        -- original price, for showing a strikethrough discount
  category text not null default 'Other',
  icon text not null default 'ri-shopping-bag-3-line', -- placeholder visual until real product photos are added
  image_url text,                         -- real product photo, once you have one — falls back to the icon until then
  stock_qty integer not null default 0,
  badge text,                             -- e.g. 'New', 'Bestseller' — shown as a small tag on the product card
  is_featured boolean not null default false,
  is_bestseller boolean not null default false,
  status text not null default 'Active' check (status in ('Active','Hidden')),
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

drop trigger if exists trg_products_updated_at on products;
create trigger trg_products_updated_at before update on products for each row execute function set_updated_at();

create index if not exists idx_products_status on products(status);
create index if not exists idx_products_category on products(category);

alter table products enable row level security;

-- Anyone can browse the storefront, logged in or not
create policy "Anyone can view active products" on products for select using (status = 'Active');
-- But only signed-in admins can see hidden/draft products, and manage the catalog
create policy "Authenticated users can view all products" on products for select using (auth.role() = 'authenticated');
create policy "Authenticated users can add products" on products for insert with check (auth.uid() is not null);
create policy "Authenticated users can update products" on products for update using (auth.role() = 'authenticated');
create policy "Authenticated users can delete products" on products for delete using (auth.role() = 'authenticated');

alter publication supabase_realtime add table products;

-- A handful of starter products so the storefront isn't empty on
-- first load — edit or delete these from the admin product manager.
insert into products (name, description, price, compare_at_price, category, icon, badge, is_featured, is_bestseller, stock_qty)
values
  ('Silicone Phone Case', 'Slim-fit protective case with raised edges for screen and camera protection.', 800, 1000, 'Phone Case', 'ri-shield-check-line', '-20%', true, true, 40),
  ('Tempered Glass Screen Protector', '9H hardness tempered glass, bubble-free installation.', 350, null, 'Screen Protector', 'ri-focus-3-line', 'New', true, false, 60),
  ('20W Fast Charger', 'USB-C fast charging wall adapter, compatible with most modern phones.', 1200, null, 'Charger', 'ri-flashlight-line', 'Bestseller', true, true, 25),
  ('Wireless Earbuds', 'Bluetooth 5.0 wireless earbuds with charging case.', 2500, 3200, 'Earphones', 'ri-headphone-line', '-20%', true, true, 15),
  ('10000mAh Power Bank', 'Portable fast-charging power bank with dual USB output.', 1800, null, 'Power Bank', 'ri-battery-charge-line', null, false, true, 20),
  ('USB-C Charging Cable', 'Durable braided 1m charging and data cable.', 400, null, 'Charging Cable', 'ri-plug-line', null, false, false, 50)
on conflict do nothing;
