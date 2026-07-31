-- ============================================================
-- SAGERO CREATIONS — Backend Phase 2
-- Phone Batches, Workflow (stage + shift assignments), Attendance
-- Dashboard reads from these same tables — no separate schema needed.
-- ============================================================
-- Run this in the SAME Supabase project as Phase 1
-- (backend_schema_phase1.sql), after that one.
-- SQL Editor → New query → paste this whole file → Run.
-- Nothing else to configure — batches.html, workflow.html,
-- attendance.html and index.html all pick this up automatically
-- once assets/js/supabase-client.js has your project URL + key.
-- ============================================================

-- ---------------- PHONE BATCHES ----------------
create table if not exists batches (
  id text primary key,                 -- e.g. 'BX-1042', kept human-readable like the rest of the app
  model text not null,
  brand text not null default 'Vivo',
  qty integer not null default 0,
  salesman text,
  manager text,
  workers integer not null default 0,
  progress integer not null default 0 check (progress between 0 and 100),
  status text not null default 'On Track' check (status in ('On Track','At Risk','Delayed','Completed')),
  stage text not null default 'Received' check (stage in
    ('Received','Assigned','Unboxed','Software','Quality Check','Resealed','Packaging','Completed')),
  received_date date not null default current_date,
  finish_date date,
  notes text,
  worker_contributions jsonb not null default '[]',   -- [{name, units}]
  activity_log jsonb not null default '[]',            -- [{text, time}]
  created_by uuid references profiles(id) on delete set null,
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

drop trigger if exists trg_batches_updated_at on batches;
create trigger trg_batches_updated_at
  before update on batches
  for each row execute function set_updated_at();  -- reuses the function from Phase 1

-- ---------------- WORKFLOW: SHIFT WORKER ALLOCATION ----------------
-- Which workers are staffed on which production stage right now.
-- Worker identity is kept as plain text (W-2001 style IDs / names)
-- since the Workers module isn't on the backend yet — this stays
-- forward-compatible if you migrate Workers in a later phase.
create table if not exists shift_assignments (
  id uuid primary key default gen_random_uuid(),
  stage text not null check (stage in
    ('Received','Assigned','Unboxed','Software','Quality Check','Resealed','Packaging','Completed')),
  worker_name text not null,
  assigned_at timestamptz not null default now(),
  unique (stage, worker_name)
);

-- ---------------- ATTENDANCE ----------------
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  worker_id text not null,             -- e.g. 'W-2001'
  worker_name text not null,
  work_date date not null,
  status text not null check (status in ('present','late','absent')),
  check_in time,
  check_out time,
  created_at timestamptz not null default now(),
  unique (worker_id, work_date)
);

create index if not exists idx_batches_stage on batches(stage);
create index if not exists idx_batches_status on batches(status);
create index if not exists idx_attendance_date on attendance(work_date);
create index if not exists idx_attendance_worker on attendance(worker_id);

-- ============================================================
-- Row Level Security — any signed-in team member can read/write.
-- Tighten later once you have real per-role permissions enforced
-- server-side (Settings → Permissions currently only controls the UI).
-- ============================================================
alter table batches enable row level security;
alter table shift_assignments enable row level security;
alter table attendance enable row level security;

create policy "Authenticated users can read batches" on batches for select using (auth.role() = 'authenticated');
create policy "Authenticated users can write batches" on batches for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update batches" on batches for update using (auth.role() = 'authenticated');
create policy "Authenticated users can delete batches" on batches for delete using (auth.role() = 'authenticated');

create policy "Authenticated users can read shift assignments" on shift_assignments for select using (auth.role() = 'authenticated');
create policy "Authenticated users can write shift assignments" on shift_assignments for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update shift assignments" on shift_assignments for update using (auth.role() = 'authenticated');
create policy "Authenticated users can delete shift assignments" on shift_assignments for delete using (auth.role() = 'authenticated');

create policy "Authenticated users can read attendance" on attendance for select using (auth.role() = 'authenticated');
create policy "Authenticated users can write attendance" on attendance for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update attendance" on attendance for update using (auth.role() = 'authenticated');
create policy "Authenticated users can delete attendance" on attendance for delete using (auth.role() = 'authenticated');

-- ============================================================
-- Realtime — the Workflow board and Batches views update live
-- across every open device the moment someone drags a card.
-- ============================================================
alter publication supabase_realtime add table batches;
alter publication supabase_realtime add table shift_assignments;
alter publication supabase_realtime add table attendance;

-- ============================================================
-- Optional starter data so these pages aren't empty on first load.
-- Safe to delete any time.
-- ============================================================
insert into batches (id, model, qty, salesman, manager, workers, progress, status, stage, received_date, finish_date)
values
  ('BX-1042', 'Vivo Y18', 200, 'Brian Mwangi', 'Wei Zhang', 4, 62, 'On Track', 'Quality Check', current_date - 3, current_date + 4),
  ('BX-1051', 'Vivo Y36', 260, 'Faith Kerubo', 'Li Chen', 3, 28, 'At Risk', 'Software', current_date - 2, current_date + 6)
on conflict do nothing;
