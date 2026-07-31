-- ============================================================
-- SAGERO CREATIONS — Fix: missing set_updated_at() function
-- ============================================================
-- BACKGROUND: backend_schema_phase2.sql referenced a function
-- called set_updated_at() that was never actually defined
-- anywhere. If you ran that file, the "create trigger" statement
-- for batches likely failed and halted the script right there —
-- which means everything AFTER it in that file (enabling RLS and
-- creating policies for batches, shift_assignments, and
-- attendance) probably never ran either.
--
-- The practical effect: those three tables likely exist and work
-- fine functionally, but have NO row-level security applied —
-- they're currently open to anyone with your anon key, not just
-- signed-in users. This script fixes the missing function and
-- (re)applies the security you were supposed to get the first
-- time. Safe to run even if some of this already exists.
-- ============================================================

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
  for each row execute function set_updated_at();

alter table batches enable row level security;
alter table shift_assignments enable row level security;
alter table attendance enable row level security;

drop policy if exists "Authenticated users can read batches" on batches;
drop policy if exists "Authenticated users can write batches" on batches;
drop policy if exists "Authenticated users can update batches" on batches;
drop policy if exists "Authenticated users can delete batches" on batches;
create policy "Authenticated users can read batches" on batches for select using (auth.role() = 'authenticated');
create policy "Authenticated users can write batches" on batches for insert to authenticated with check (true);
create policy "Authenticated users can update batches" on batches for update using (auth.role() = 'authenticated');
create policy "Authenticated users can delete batches" on batches for delete using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read shift assignments" on shift_assignments;
drop policy if exists "Authenticated users can write shift assignments" on shift_assignments;
drop policy if exists "Authenticated users can update shift assignments" on shift_assignments;
drop policy if exists "Authenticated users can delete shift assignments" on shift_assignments;
create policy "Authenticated users can read shift assignments" on shift_assignments for select using (auth.role() = 'authenticated');
create policy "Authenticated users can write shift assignments" on shift_assignments for insert to authenticated with check (true);
create policy "Authenticated users can update shift assignments" on shift_assignments for update using (auth.role() = 'authenticated');
create policy "Authenticated users can delete shift assignments" on shift_assignments for delete using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read attendance" on attendance;
drop policy if exists "Authenticated users can write attendance" on attendance;
drop policy if exists "Authenticated users can update attendance" on attendance;
drop policy if exists "Authenticated users can delete attendance" on attendance;
create policy "Authenticated users can read attendance" on attendance for select using (auth.role() = 'authenticated');
create policy "Authenticated users can write attendance" on attendance for insert to authenticated with check (true);
create policy "Authenticated users can update attendance" on attendance for update using (auth.role() = 'authenticated');
create policy "Authenticated users can delete attendance" on attendance for delete using (auth.role() = 'authenticated');

-- Also make sure realtime is actually on for these (also likely
-- skipped if the script halted before reaching this point)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='batches') then
    alter publication supabase_realtime add table batches;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='shift_assignments') then
    alter publication supabase_realtime add table shift_assignments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='attendance') then
    alter publication supabase_realtime add table attendance;
  end if;
end $$;

-- Verify: should show rowsecurity = true for all three
select relname, relrowsecurity from pg_class where relname in ('batches','shift_assignments','attendance');
