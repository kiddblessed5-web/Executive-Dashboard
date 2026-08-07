-- ============================================================
-- SAGERO CREATIONS — Store upgrade: coupons, newsletter, reviews
-- ============================================================

-- ---------------- COUPONS ----------------
create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null default 'percent' check (discount_type in ('percent','fixed')),
  discount_value numeric(10,2) not null,
  min_order_total numeric(10,2) default 0,
  max_uses integer,                    -- null = unlimited
  times_used integer not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table coupons enable row level security;
create policy "Anyone can check a coupon code" on coupons for select using (active = true);
create policy "Authenticated users can view all coupons" on coupons for select using (auth.role() = 'authenticated');
create policy "Authenticated users can manage coupons" on coupons for insert with check (auth.uid() is not null);
create policy "Authenticated users can update coupons" on coupons for update using (auth.role() = 'authenticated');
create policy "Authenticated users can delete coupons" on coupons for delete using (auth.role() = 'authenticated');
alter publication supabase_realtime add table coupons;

-- a couple of real starter codes
insert into coupons (code, discount_type, discount_value, min_order_total, active)
values
  ('WELCOME10', 'percent', 10, 0, true),
  ('SAVE200', 'fixed', 200, 1500, true)
on conflict (code) do nothing;

-- ---------------- NEWSLETTER ----------------
create table if not exists newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  subscribed_at timestamptz not null default now()
);
alter table newsletter_subscribers enable row level security;
create policy "Anyone can subscribe" on newsletter_subscribers for insert with check (true);
create policy "Authenticated users can view subscribers" on newsletter_subscribers for select using (auth.role() = 'authenticated');
create policy "Authenticated users can remove subscribers" on newsletter_subscribers for delete using (auth.role() = 'authenticated');

-- ---------------- PRODUCT REVIEWS ----------------
-- Real reviews, left by real site visitors (no fake seeded ratings).
create table if not exists product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  customer_name text not null,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);
create index if not exists idx_reviews_product on product_reviews(product_id);
alter table product_reviews enable row level security;
create policy "Anyone can read reviews" on product_reviews for select using (true);
create policy "Anyone can leave a review" on product_reviews for insert with check (true);
create policy "Authenticated users can delete reviews" on product_reviews for delete using (auth.role() = 'authenticated');
alter publication supabase_realtime add table product_reviews;
