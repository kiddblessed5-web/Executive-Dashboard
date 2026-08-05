-- ============================================================
-- SAGERO CREATIONS — Add device_models table
-- ============================================================
create table if not exists device_models (
  name text primary key,
  created_at timestamptz not null default now()
);
alter table device_models enable row level security;
create policy "Authenticated users can read device models" on device_models for select using (auth.role() = 'authenticated');
create policy "Authenticated users can add device models" on device_models for insert with check (auth.uid() is not null);
alter publication supabase_realtime add table device_models;
