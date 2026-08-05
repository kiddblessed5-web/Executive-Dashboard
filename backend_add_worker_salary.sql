-- ============================================================
-- SAGERO CREATIONS — Add salary field to Workers
-- ============================================================
-- Safe to run even if you've already got the workers table set up.
-- ============================================================
alter table workers add column if not exists salary numeric(10,2) not null default 0;
