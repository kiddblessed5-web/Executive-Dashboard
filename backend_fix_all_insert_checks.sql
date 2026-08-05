-- ============================================================
-- SAGERO CREATIONS — Consolidated fix: auth.uid() checks everywhere
-- ============================================================
-- Applies the more robust check (see backend_fix_auth_uid_check.sql
-- for the explanation) to EVERY table in the database at once,
-- not just messaging. Safe to run regardless of what's already
-- been applied — every policy is dropped and recreated fresh.
-- ============================================================

-- ---------------- MESSAGING ----------------
drop policy if exists "Signed-in users can create conversations" on conversations;
create policy "Signed-in users can create conversations" on conversations
  for insert with check (auth.uid() is not null);

drop policy if exists "Signed-in users can add members" on conversation_members;
create policy "Signed-in users can add members" on conversation_members
  for insert with check (auth.uid() is not null);

drop policy if exists "Members can send messages in their conversations" on messages;
create policy "Members can send messages in their conversations" on messages
  for insert with check (auth.uid() = sender_id and is_conversation_member(conversation_id, auth.uid()));

drop policy if exists "Signed-in users can react" on message_reactions;
create policy "Signed-in users can react" on message_reactions
  for insert with check (auth.uid() is not null and auth.uid() = user_id);

-- ---------------- BATCHES / WORKFLOW / ATTENDANCE ----------------
drop policy if exists "Authenticated users can write batches" on batches;
create policy "Authenticated users can write batches" on batches
  for insert with check (auth.uid() is not null);

drop policy if exists "Authenticated users can write shift assignments" on shift_assignments;
create policy "Authenticated users can write shift assignments" on shift_assignments
  for insert with check (auth.uid() is not null);

drop policy if exists "Authenticated users can write attendance" on attendance;
create policy "Authenticated users can write attendance" on attendance
  for insert with check (auth.uid() is not null);

-- ---------------- PAYROLL / WAREHOUSE ----------------
drop policy if exists "Authenticated users can create payroll runs" on payroll_runs;
create policy "Authenticated users can create payroll runs" on payroll_runs
  for insert with check (auth.uid() is not null);

drop policy if exists "Authenticated users can write stock" on warehouse_stock;
create policy "Authenticated users can write stock" on warehouse_stock
  for insert with check (auth.uid() is not null);

drop policy if exists "Authenticated users can log shipments" on warehouse_shipments;
create policy "Authenticated users can log shipments" on warehouse_shipments
  for insert with check (auth.uid() is not null);

-- ---------------- DEVICES / ACCESSORIES / WORKERS / QC ----------------
drop policy if exists "Authenticated users can create scan lists" on inventory_scan_lists;
create policy "Authenticated users can create scan lists" on inventory_scan_lists
  for insert with check (auth.uid() is not null);

drop policy if exists "Authenticated users can add scan items" on inventory_scan_items;
create policy "Authenticated users can add scan items" on inventory_scan_items
  for insert with check (auth.uid() is not null);

drop policy if exists "Authenticated users can write accessory stock" on accessories_stock;
create policy "Authenticated users can write accessory stock" on accessories_stock
  for insert with check (auth.uid() is not null);

drop policy if exists "Authenticated users can add workers" on workers;
create policy "Authenticated users can add workers" on workers
  for insert with check (auth.uid() is not null);

drop policy if exists "Authenticated users can create inspections" on qc_inspections;
create policy "Authenticated users can create inspections" on qc_inspections
  for insert with check (auth.uid() is not null);

-- ---------------- SETTINGS / AUDIT ----------------
drop policy if exists "Authenticated users can write app settings" on app_settings;
create policy "Authenticated users can write app settings" on app_settings
  for insert with check (auth.uid() is not null);

drop policy if exists "Authenticated users can write audit log" on audit_log;
create policy "Authenticated users can write audit log" on audit_log
  for insert with check (auth.uid() is not null);

-- ============================================================
-- VERIFY — lists every INSERT policy left in the database.
-- None of these should say "to authenticated" in the check
-- column below (except the storage policy, which is expected
-- to use that pattern — Supabase Storage works differently).
-- ============================================================
select tablename, policyname, with_check
from pg_policies
where cmd = 'INSERT'
order by tablename;
