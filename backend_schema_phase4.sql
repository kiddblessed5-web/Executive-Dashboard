-- ============================================================
-- SAGERO CREATIONS — Backend Phase 4
-- Shared scan-in inventory backend for Devices (phones) AND the
-- new Accessories page. One pair of tables serves both, since
-- they're structurally identical: scan barcodes in, save as a
-- named list, export.
-- ============================================================

create table if not exists inventory_scan_lists (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('device','accessory')),
  name text not null,
  model_or_category text not null,   -- phone model for devices, accessory category for accessories
  batch_ref text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists inventory_scan_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references inventory_scan_lists(id) on delete cascade,
  barcode text not null,
  label text not null,               -- phone model or accessory item name at time of scan
  scanned_at timestamptz not null default now()
);

create index if not exists idx_scan_lists_kind on inventory_scan_lists(kind);
create index if not exists idx_scan_items_list on inventory_scan_items(list_id);

alter table inventory_scan_lists enable row level security;
alter table inventory_scan_items enable row level security;

create policy "Authenticated users can read scan lists" on inventory_scan_lists for select using (auth.role() = 'authenticated');
create policy "Authenticated users can create scan lists" on inventory_scan_lists for insert with check (auth.uid() is not null);
create policy "Authenticated users can delete scan lists" on inventory_scan_lists for delete using (auth.role() = 'authenticated');

create policy "Authenticated users can read scan items" on inventory_scan_items for select using (auth.role() = 'authenticated');
create policy "Authenticated users can add scan items" on inventory_scan_items for insert with check (auth.uid() is not null);

alter publication supabase_realtime add table inventory_scan_lists;
alter publication supabase_realtime add table inventory_scan_items;


-- ============================================================
-- Add account status + email to profiles (used by User Roles).
-- Email is copied from auth.users at signup since that table
-- isn't directly queryable from client-side code.
-- ============================================================
alter table profiles add column if not exists status text not null default 'Active' check (status in ('Active','Suspended'));
alter table profiles add column if not exists email text;

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), new.email);
  return new;
end;
$$ language plpgsql security definer;

-- Backfill email for any profiles that already exist without it
update profiles p set email = u.email from auth.users u where p.id = u.id and p.email is null;

drop policy if exists "Authenticated users can update any profile" on profiles;
create policy "Authenticated users can update any profile" on profiles for update using (auth.role() = 'authenticated');


-- ============================================================
-- STORAGE — real image/video attachments in Messages.
-- Public bucket so uploaded media can be shown with a plain
-- <img>/<video> tag without needing signed URLs.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', true)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can upload attachments" on storage.objects;
drop policy if exists "Anyone can view message attachments" on storage.objects;
drop policy if exists "Users can delete their own attachments" on storage.objects;

create policy "Authenticated users can upload attachments" on storage.objects
  for insert to authenticated with check (bucket_id = 'message-attachments');
create policy "Anyone can view message attachments" on storage.objects
  for select using (bucket_id = 'message-attachments');
create policy "Users can delete their own attachments" on storage.objects
  for delete using (bucket_id = 'message-attachments' and auth.uid() = owner);


-- ============================================================
-- DEVICE MODELS — the base 25 Vivo models ship built into the
-- dropdown in the page itself; this table only holds ones you
-- add later via the "+" button, so everyone sees the same list.
-- ============================================================
create table if not exists device_models (
  name text primary key,
  created_at timestamptz not null default now()
);
alter table device_models enable row level security;
create policy "Authenticated users can read device models" on device_models for select using (auth.role() = 'authenticated');
create policy "Authenticated users can add device models" on device_models for insert with check (auth.uid() is not null);
alter publication supabase_realtime add table device_models;


-- ============================================================
-- SHARED APP SETTINGS — a simple key/value store for workspace-
-- wide settings that should be the same for everyone (company
-- info, the permissions matrix). Personal/device preferences
-- like dark mode or density stay in localStorage on purpose —
-- those shouldn't sync across devices.
-- ============================================================
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;
create policy "Authenticated users can read app settings" on app_settings for select using (auth.role() = 'authenticated');
create policy "Authenticated users can write app settings" on app_settings for insert with check (auth.uid() is not null);
create policy "Authenticated users can update app settings" on app_settings for update using (auth.role() = 'authenticated');
alter publication supabase_realtime add table app_settings;


-- ============================================================
-- AUDIT LOGS — a real, append-only activity trail.
-- ============================================================
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  actor_name text not null,
  category text not null,
  event_text text not null,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_category on audit_log(category);
create index if not exists idx_audit_log_created on audit_log(created_at desc);

alter table audit_log enable row level security;
create policy "Authenticated users can read audit log" on audit_log for select using (auth.role() = 'authenticated');
create policy "Authenticated users can write audit log" on audit_log for insert with check (auth.uid() is not null);
alter publication supabase_realtime add table audit_log;


-- ============================================================
-- QUALITY CONTROL — inspections, linked loosely to batches by
-- batch_id (text, matching the human-readable BX-xxxx ids).
-- ============================================================
create table if not exists qc_inspections (
  id text primary key,                -- e.g. 'QC-3001'
  batch_id text,
  model text not null,
  qty integer not null default 0,
  inspector text,
  status text not null default 'Pending' check (status in ('Pending','Passed','Failed')),
  approval_state text check (approval_state in ('pending','Approved','Rejected')),
  severity text check (severity in ('Low','Medium','High')),
  defects jsonb not null default '[]',
  photos jsonb not null default '[]',
  notes text,
  inspection_date timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_qc_updated_at on qc_inspections;
create trigger trg_qc_updated_at before update on qc_inspections for each row execute function set_updated_at();

alter table qc_inspections enable row level security;
create policy "Authenticated users can read inspections" on qc_inspections for select using (auth.role() = 'authenticated');
create policy "Authenticated users can create inspections" on qc_inspections for insert with check (auth.uid() is not null);
create policy "Authenticated users can update inspections" on qc_inspections for update using (auth.role() = 'authenticated');
alter publication supabase_realtime add table qc_inspections;

-- Seed a handful of pending inspections so the Queue isn't empty
insert into qc_inspections (id, batch_id, model, qty, inspector, status)
values
  ('QC-3001','BX-1030','Y18',120,'Kevin Otieno','Pending'),
  ('QC-3002','BX-1031','X300',60,'Mercy Njoki','Pending'),
  ('QC-3003','BX-1032','V50',90,'Ruth Wanjiku','Pending')
on conflict do nothing;


-- ============================================================
-- WORKERS — the shop-floor roster (distinct from `profiles`,
-- which is login accounts). Attendance rate and history are
-- computed live from the real `attendance` table by worker id,
-- not stored here.
-- ============================================================
create table if not exists workers (
  id text primary key,               -- e.g. 'W-2001'
  name text not null,
  role text not null,
  department text not null default 'Production',
  status text not null default 'Active' check (status in ('Active','Warning','Inactive')),
  avatar_color text not null default '#6D5DF6',
  phone text,
  salary numeric(10,2) not null default 0,
  skills jsonb not null default '[]',
  warnings jsonb not null default '[]',
  achievements jsonb not null default '[]',
  joined_date date not null default current_date,
  created_at timestamptz not null default now()
);
alter table workers add column if not exists phone text; -- safe to run even if you already created this table
alter table workers add column if not exists salary numeric(10,2) not null default 0;
alter table workers add column if not exists profile_id uuid references profiles(id) on delete set null;
create index if not exists idx_workers_profile on workers(profile_id);

alter table workers enable row level security;
create policy "Authenticated users can read workers" on workers for select using (auth.role() = 'authenticated');
create policy "Authenticated users can add workers" on workers for insert with check (auth.uid() is not null);
create policy "Authenticated users can update workers" on workers for update using (auth.role() = 'authenticated');
create policy "Authenticated users can remove workers" on workers for delete using (auth.role() = 'authenticated');
alter publication supabase_realtime add table workers;
create table if not exists accessories_stock (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  item_name text not null,
  qty integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (category, item_name)
);

alter table accessories_stock enable row level security;
create policy "Authenticated users can read accessory stock" on accessories_stock for select using (auth.role() = 'authenticated');
create policy "Authenticated users can write accessory stock" on accessories_stock for insert with check (auth.uid() is not null);
create policy "Authenticated users can update accessory stock" on accessories_stock for update using (auth.role() = 'authenticated');

alter publication supabase_realtime add table accessories_stock;
