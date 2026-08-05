-- ============================================================
-- SAGERO CREATIONS — The actual fix
-- ============================================================
-- Root cause: your app does .insert({...}).select().single() when
-- creating a conversation — which means Postgres has to let you
-- READ BACK the row you just inserted, immediately. Your SELECT
-- policy on conversations only allowed that if you're already a
-- member (checked via conversation_members) — but membership rows
-- get added in a SEPARATE step, right after. So for that one
-- instant between "conversation created" and "membership added",
-- you don't yet satisfy your own SELECT policy — and Postgres
-- blocks the read-back, which surfaces as if the INSERT failed.
--
-- Fix: let the creator see their own conversation immediately,
-- in addition to the existing membership check.
-- ============================================================

drop policy if exists "Members can view their conversations" on conversations;
create policy "Members can view their conversations" on conversations for select using (
  is_conversation_member(id, auth.uid()) or created_by = auth.uid()
);

-- Verify — should show the new OR condition:
select policyname, cmd, qual
from pg_policies
where tablename = 'conversations' and cmd = 'SELECT';
