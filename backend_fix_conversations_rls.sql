-- ============================================================
-- SAGERO CREATIONS — Messaging RLS: diagnose + hard reset
-- ============================================================
-- Run STEP 1 first and read the output. Then run STEP 2 (safe to
-- run even if you've already run other migrations — every DROP
-- uses IF EXISTS, so this can't fail no matter what state your
-- database is currently in).
-- ============================================================


-- ============================================================
-- STEP 1 — DIAGNOSTIC
-- Run this first. It lists every policy currently on these four
-- tables. Paste the result back if step 2 doesn't fix it.
-- ============================================================
select tablename, policyname, cmd, qual, with_check
from pg_policies
where tablename in ('conversations','conversation_members','messages','message_reactions')
order by tablename, cmd;

-- Also confirm RLS is actually turned on for these tables
-- (should show rowsecurity = true for all four):
select relname, relrowsecurity
from pg_class
where relname in ('conversations','conversation_members','messages','message_reactions');


-- ============================================================
-- STEP 2 — HARD RESET
-- Drops every policy on these tables (whatever they currently
-- are, correct or not) and recreates the full correct set from
-- scratch. This is the same recursion-safe version from
-- backend_migration_fix_rls.sql — running it again is harmless.
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

do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where tablename in ('conversations','conversation_members','messages','message_reactions')
  loop
    execute format('drop policy if exists %I on %I', pol.policyname, pol.tablename);
  end loop;
end $$;

alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;
alter table message_reactions enable row level security;

create policy "Members can view their conversations" on conversations for select using (
  is_conversation_member(id, auth.uid())
);
create policy "Signed-in users can create conversations" on conversations for insert to authenticated with check (true);

create policy "Members can view membership rows for their conversations" on conversation_members for select using (
  is_conversation_member(conversation_id, auth.uid())
);
create policy "Signed-in users can add members" on conversation_members for insert to authenticated with check (true);
create policy "Members can remove their own membership" on conversation_members for delete using (auth.uid() = user_id);
create policy "Members can update their own last_read_at" on conversation_members for update using (auth.uid() = user_id);

create policy "Members can read messages in their conversations" on messages for select using (
  is_conversation_member(conversation_id, auth.uid())
);
create policy "Members can send messages in their conversations" on messages for insert to authenticated with check (
  auth.uid() = sender_id and is_conversation_member(conversation_id, auth.uid())
);
create policy "Senders can update their own messages" on messages for update using (auth.uid() = sender_id);

create policy "Members can read reactions" on message_reactions for select using (
  exists (select 1 from messages msg where msg.id = message_id and is_conversation_member(msg.conversation_id, auth.uid()))
);
create policy "Signed-in users can react" on message_reactions for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can remove their own reactions" on message_reactions for delete using (auth.uid() = user_id);

-- Re-run the diagnostic from Step 1 after this to confirm the
-- final policy list looks right.
