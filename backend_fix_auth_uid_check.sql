-- ============================================================
-- SAGERO CREATIONS — Fix attempt 3: switch INSERT checks from
-- role-targeting to auth.uid() checks
-- ============================================================
-- Your policies are structurally correct (confirmed via the
-- diagnostic) — but they use `to authenticated with check (true)`,
-- which only applies if your DB session is literally IN the
-- Postgres role called "authenticated". With the newer
-- sb_publishable_ key format, that role-switch may not be
-- happening the way it does with the older key style.
--
-- This switches every INSERT/relevant check to test
-- `auth.uid() is not null` instead — a function-based check that
-- doesn't depend on which Postgres role the connection is in,
-- just whether a real signed-in user's ID is present in the
-- request. This is Supabase's own most common pattern and should
-- work regardless of key format.
-- ============================================================

drop policy if exists "Signed-in users can create conversations" on conversations;
create policy "Signed-in users can create conversations" on conversations
  for insert with check (auth.uid() is not null);

drop policy if exists "Signed-in users can add members" on conversation_members;
create policy "Signed-in users can add members" on conversation_members
  for insert with check (auth.uid() is not null);

drop policy if exists "Members can send messages in their conversations" on messages;
create policy "Members can send messages in their conversations" on messages
  for insert with check (
    auth.uid() = sender_id and is_conversation_member(conversation_id, auth.uid())
  );

drop policy if exists "Signed-in users can react" on message_reactions;
create policy "Signed-in users can react" on message_reactions
  for insert with check (auth.uid() is not null and auth.uid() = user_id);

-- ============================================================
-- DIAGNOSTIC — run this WHILE your app would be making the
-- request (i.e. paste your actual anon key context isn't
-- reproducible here, but this at least confirms the function
-- itself works and the policies are attached correctly):
-- ============================================================
select policyname, cmd, with_check
from pg_policies
where tablename in ('conversations','conversation_members','messages','message_reactions')
  and cmd = 'INSERT';
