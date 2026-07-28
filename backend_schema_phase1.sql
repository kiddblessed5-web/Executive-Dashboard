-- ============================================================
-- SAGERO CREATIONS — Backend Phase 1
-- Real accounts + cross-device Messages
-- ============================================================
-- HOW TO USE THIS FILE:
-- 1. Create a free project at https://supabase.com (if you
--    haven't already for the CRM schema — you can reuse the
--    same project, this just adds more tables to it)
-- 2. Project → SQL Editor → New query → paste this whole file → Run
-- 3. Project → Authentication → Providers:
--      - Email is on by default, that covers signup/login
--      - To enable "Continue with Google" / "Continue with
--        Facebook": toggle each provider on and paste in the
--        same Client ID / App ID + secret you got from Google
--        Cloud Console / Meta for Developers
--      - Under Authentication → URL Configuration, add your
--        deployed site URL (and http://localhost:xxxx for local
--        testing) to "Redirect URLs"
-- 4. Project Settings → API → copy "Project URL" and
--    "anon public" key
-- 5. Paste both into assets/js/supabase-client.js
-- ============================================================

-- ---------------- PROFILES ----------------
-- One row per signed-up user, auto-created on signup (trigger below).
-- Extends Supabase's built-in auth.users with the fields the UI needs.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'New User',
  role text not null default 'Worker',
  avatar_color text not null default '#6D5DF6',
  is_online boolean not null default false,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------- CONVERSATIONS ----------------
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'dm' check (type in ('dm','group','channel')),
  name text,                      -- used for groups/channels; null for 1:1 DMs
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- ---------------- MESSAGES ----------------
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text,
  attachment jsonb,                -- {type:'image'|'file'|'voice', ...}
  poll jsonb,                      -- {question, options:[{label,votes}], myVote}
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index if not exists idx_messages_conversation on messages(conversation_id, created_at);
create index if not exists idx_members_user on conversation_members(user_id);

-- ============================================================
-- Row Level Security — you only see conversations you're a member of
-- ============================================================
alter table profiles enable row level security;
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;
alter table message_reactions enable row level security;

create policy "Anyone signed in can view profiles" on profiles for select using (auth.role() = 'authenticated');
create policy "Users can update their own profile" on profiles for update using (auth.uid() = id);

create policy "Members can view their conversations" on conversations for select using (
  exists (select 1 from conversation_members m where m.conversation_id = id and m.user_id = auth.uid())
);
create policy "Signed-in users can create conversations" on conversations for insert with check (auth.role() = 'authenticated');

create policy "Members can view membership rows for their conversations" on conversation_members for select using (
  exists (select 1 from conversation_members m2 where m2.conversation_id = conversation_id and m2.user_id = auth.uid())
);
create policy "Signed-in users can add members" on conversation_members for insert with check (auth.role() = 'authenticated');

create policy "Members can read messages in their conversations" on messages for select using (
  exists (select 1 from conversation_members m where m.conversation_id = messages.conversation_id and m.user_id = auth.uid())
);
create policy "Members can send messages in their conversations" on messages for insert with check (
  auth.uid() = sender_id and
  exists (select 1 from conversation_members m where m.conversation_id = messages.conversation_id and m.user_id = auth.uid())
);
create policy "Senders can update their own messages" on messages for update using (auth.uid() = sender_id);

create policy "Members can read reactions" on message_reactions for select using (
  exists (select 1 from messages msg join conversation_members m on m.conversation_id = msg.conversation_id
          where msg.id = message_id and m.user_id = auth.uid())
);
create policy "Signed-in users can react" on message_reactions for insert with check (auth.uid() = user_id);
create policy "Users can remove their own reactions" on message_reactions for delete using (auth.uid() = user_id);

-- ============================================================
-- Realtime — lets every open browser get new messages instantly
-- ============================================================
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table message_reactions;
alter publication supabase_realtime add table profiles;
