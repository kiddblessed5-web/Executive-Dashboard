-- ============================================================
-- SAGERO CREATIONS — Backend Phase 3
-- Cleanup queries + Shift Clock Off + Payroll + Warehouse
-- ============================================================
-- Run this in the SAME Supabase project as Phase 1 & 2.
-- ============================================================


-- ============================================================
-- SECTION A — CLEANUP QUERIES
-- Run only the ones you actually want. Each is commented out
-- with -- so nothing runs by accident — delete the -- on the
-- lines you want to execute.
-- ============================================================

-- Clear all conversations/messages so you can add your real team
-- fresh in Messages (keeps your own account, deletes everyone
-- else's profile + every conversation/message/reaction):
-- delete from message_reactions;
-- delete from messages;
-- delete from conversation_members;
-- delete from conversations;
-- delete from profiles where id != auth.uid();

-- Clear Workflow's worker shift allocations (batches themselves
-- are left alone — this only clears who's assigned to which stage):
-- delete from shift_assignments;

-- Clear all batches (Batches + Workflow + Dashboard all read this
-- same table, so this empties all three):
-- delete from batches;

-- Clear all attendance history:
-- delete from attendance;


-- ============================================================
-- SECTION B — SHIFT CLOCK (Dashboard "Clock Off" ↔ Workflow)
-- A single shared row tracks whether the shift is currently
-- running. Dashboard's Clock Off button stops it; it's designed
-- to auto-resume the next day at 8:00 AM (handled client-side —
-- see assets/js/dashboard.js / workflow.js — since Supabase's
-- free tier doesn't run scheduled jobs by default).
-- ============================================================
create table if not exists shift_status (
  id int primary key default 1,
  is_running boolean not null default true,
  shift_started_at timestamptz not null default now(),
  stopped_at timestamptz,
  stopped_by uuid references profiles(id) on delete set null,
  constraint single_row check (id = 1)
);
insert into shift_status (id, is_running, shift_started_at) values (1, true, now()) on conflict (id) do nothing;

alter table shift_status enable row level security;
create policy "Authenticated users can read shift status" on shift_status for select using (auth.role() = 'authenticated');
create policy "Authenticated users can update shift status" on shift_status for update using (auth.role() = 'authenticated');
alter publication supabase_realtime add table shift_status;


-- ============================================================
-- SECTION C — PAYROLL
-- Persists each payroll run (weekly/monthly) so "Paid" status and
-- totals survive refresh and are shared across devices, instead
-- of living only in one browser's localStorage. The per-worker
-- math itself still derives live from the `attendance` table,
-- same as before — this table just records that a run happened.
-- ============================================================
create table if not exists payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_type text not null check (period_type in ('weekly','monthly')),
  period_key text not null,             -- e.g. '2026-07-13' for weekly, '2026-07' for monthly
  label text not null,
  total numeric(12,2) not null default 0,
  workers_paid integer not null default 0,
  status text not null default 'Paid' check (status in ('Paid','Pending')),
  run_by uuid references profiles(id) on delete set null,
  run_at timestamptz not null default now(),
  unique (period_type, period_key)
);

alter table payroll_runs enable row level security;
create policy "Authenticated users can read payroll runs" on payroll_runs for select using (auth.role() = 'authenticated');
create policy "Authenticated users can create payroll runs" on payroll_runs for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update payroll runs" on payroll_runs for update using (auth.role() = 'authenticated');
alter publication supabase_realtime add table payroll_runs;


-- ============================================================
-- SECTION D — WAREHOUSE
-- Stock levels per model + the incoming/outgoing shipment log.
-- ============================================================
create table if not exists warehouse_stock (
  model text primary key,
  in_stock integer not null default 0,
  reorder_threshold integer not null default 80,
  updated_at timestamptz not null default now()
);

create table if not exists warehouse_shipments (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('Incoming','Outgoing')),
  model text not null,
  qty integer not null,
  reference text,
  status text not null default 'Pending' check (status in ('Pending','Completed')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_wh_shipments_status on warehouse_shipments(status);
create index if not exists idx_wh_shipments_type on warehouse_shipments(type);

alter table warehouse_stock enable row level security;
alter table warehouse_shipments enable row level security;

create policy "Authenticated users can read stock" on warehouse_stock for select using (auth.role() = 'authenticated');
create policy "Authenticated users can write stock" on warehouse_stock for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update stock" on warehouse_stock for update using (auth.role() = 'authenticated');

create policy "Authenticated users can read shipments" on warehouse_shipments for select using (auth.role() = 'authenticated');
create policy "Authenticated users can log shipments" on warehouse_shipments for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update shipments" on warehouse_shipments for update using (auth.role() = 'authenticated');

alter publication supabase_realtime add table warehouse_stock;
alter publication supabase_realtime add table warehouse_shipments;

-- Seed starting stock rows for the full Vivo lineup at 0 — Warehouse
-- will show these immediately, and every "Mark received" shipment
-- adds to the real total from there.
insert into warehouse_stock (model, in_stock, reorder_threshold) values
  ('Y17s',0,80), ('Y18',0,80), ('Y18t',0,80), ('Y28',0,80), ('Y36',0,80),
  ('Y50t',0,80), ('Y100',0,80), ('Y200',0,80), ('Y300',0,80), ('Y300 Plus',0,80),
  ('V30',0,80), ('V40',0,80), ('V50',0,80), ('V50 Pro',0,80), ('V50 Lite',0,80),
  ('V70',0,80), ('V70 Elite',0,80),
  ('X100',0,80), ('X200',0,80), ('X200 Ultra',0,80), ('X300',0,80), ('X300 Pro',0,80), ('X300 Ultra',0,80),
  ('T3',0,80), ('T4',0,80)
on conflict (model) do nothing;
