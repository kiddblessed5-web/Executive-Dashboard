-- ============================================================
-- SAGERO CREATIONS — Migration: fix RLS recursion + add unread tracking
-- ============================================================
-- RUN THIS NOW in your existing Supabase project's SQL Editor.
-- This repairs the live database — it does not recreate tables,
-- it only fixes broken policies and adds one column.
--
-- ROOT CAUSE of "infinite recursion detected in policy" and the
-- cascading "new row violates row-level security policy" /
-- messages-not-reloading symptoms:
--
-- The original conversation_members SELECT policy checked
-- membership by querying conversation_members FROM WITHIN its
-- own policy — Postgres has to re-evaluate the same RLS policy
-- to answer that subquery, which re-triggers the subquery,
-- forever. Because `conversations`, `messages`, and
-- `message_reactions` all check membership via
-- conversation_members too, this one bug broke reads/writes
-- across the entire messaging system, not just that one table.
--
-- FIX: check membership through a SECURITY DEFINER function.
-- That function runs with elevated privileges and bypasses RLS
-- for its own internal lookup, so it can safely query
-- conversation_members without re-triggering the policy that
-- calls it — no recursion.
-- ============================================================

create or replace function is_conversation_member(conv_id uuid, uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from conversation_members
    where conversation_id = conv_id and user_id = uid
  );
$$;

-- ---------------- Drop every existing policy on the affected
-- tables, so nothing conflicting or duplicated is left behind ----------------
drop policy if exists "Members can view their conversations" on conversations;
drop policy if exists "Signed-in users can create conversations" on conversations;

drop policy if exists "Members can view membership rows for their conversations" on conversation_members;
drop policy if exists "Signed-in users can add members" on conversation_members;

drop policy if exists "Members can read messages in their conversations" on messages;
drop policy if exists "Members can send messages in their conversations" on messages;
drop policy if exists "Senders can update their own messages" on messages;

drop policy if exists "Members can read reactions" on message_reactions;
drop policy if exists "Signed-in users can react" on message_reactions;
drop policy if exists "Users can remove their own reactions" on message_reactions;

-- ---------------- Recreate them using the recursion-safe function ----------------
create policy "Members can view their conversations" on conversations for select using (
  is_conversation_member(id, auth.uid())
);
create policy "Signed-in users can create conversations" on conversations for insert with check (auth.role() = 'authenticated');

-- conversation_members no longer self-references — it just checks
-- "is the requesting user a member of ANY conversation this row
-- belongs to", using the SECURITY DEFINER function instead of a
-- raw subquery against itself.
create policy "Members can view membership rows for their conversations" on conversation_members for select using (
  is_conversation_member(conversation_id, auth.uid())
);
create policy "Signed-in users can add members" on conversation_members for insert with check (auth.role() = 'authenticated');
create policy "Members can remove their own membership" on conversation_members for delete using (auth.uid() = user_id);

create policy "Members can read messages in their conversations" on messages for select using (
  is_conversation_member(conversation_id, auth.uid())
);
create policy "Members can send messages in their conversations" on messages for insert with check (
  auth.uid() = sender_id and is_conversation_member(conversation_id, auth.uid())
);
create policy "Senders can update their own messages" on messages for update using (auth.uid() = sender_id);

create policy "Members can read reactions" on message_reactions for select using (
  exists (select 1 from messages msg where msg.id = message_id and is_conversation_member(msg.conversation_id, auth.uid()))
);
create policy "Signed-in users can react" on message_reactions for insert with check (auth.uid() = user_id);
create policy "Users can remove their own reactions" on message_reactions for delete using (auth.uid() = user_id);

-- ============================================================
-- Unread counts, done properly (synced across every device/tab,
-- not just tracked in one browser's localStorage)
-- ============================================================
alter table conversation_members add column if not exists last_read_at timestamptz not null default now();

create policy "Members can update their own last_read_at" on conversation_members for update using (auth.uid() = user_id);

-- ============================================================
-- Sanity check — run this after the migration to confirm no
-- policy still references conversation_members from within its
-- own table's policy (should return zero rows).
-- ============================================================
select tablename, policyname, qual
from pg_policies
where tablename = 'conversation_members' and qual ilike '%conversation_members%';
