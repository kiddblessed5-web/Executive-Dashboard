-- ============================================================
-- SAGERO CREATIONS — Link workers to real login accounts
-- ============================================================
-- Lets a worker who has their own login (via User Roles) check
-- themselves in from the topbar button. Safe to run even if
-- you've already got the workers table set up.
--
-- After running this, link a worker to their account: go to
-- Workers, open their profile, and set their linked account —
-- OR run this manually for now:
--   update workers set profile_id = '<their auth user id>' where id = '<worker id>';
-- (Find their auth user id in Supabase → Authentication → Users)
-- ============================================================
alter table workers add column if not exists profile_id uuid references profiles(id) on delete set null;
create index if not exists idx_workers_profile on workers(profile_id);
