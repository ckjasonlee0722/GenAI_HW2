-- =====================================================================
-- GenAI HW2 v2 schema migration
-- 跑這個前先確認 HW1 的 conversations / messages table 已經存在
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Long-term memory: 簡單 key-value facts
-- ---------------------------------------------------------------------
create table if not exists memories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  key         text not null,
  value       text not null,
  category    text default 'general',           -- personal | preference | context | general
  source_msg  uuid references messages(id) on delete set null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(user_id, key)                          -- upsert: 同 key 用新值覆蓋
);

create index if not exists memories_user_idx on memories(user_id);

alter table memories enable row level security;

-- 每個 user 只能看/改自己的 memories
create policy "memories: select own"
  on memories for select using (auth.uid() = user_id);
create policy "memories: insert own"
  on memories for insert with check (auth.uid() = user_id);
create policy "memories: update own"
  on memories for update using (auth.uid() = user_id);
create policy "memories: delete own"
  on memories for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 2. Conversation branching: messages 加 parent_id + branch_id
-- ---------------------------------------------------------------------
alter table messages
  add column if not exists parent_id uuid references messages(id) on delete set null;

alter table messages
  add column if not exists branch_id uuid not null default gen_random_uuid();

-- 同一個 conversation 內，root branch 的 branch_id = conversation_id
-- 分叉時新 branch 拿到新的 random uuid
create index if not exists messages_branch_idx on messages(conversation_id, branch_id);
create index if not exists messages_parent_idx on messages(parent_id);

-- ---------------------------------------------------------------------
-- 3. Routing log（給 demo 用，可以給助教看路由決策歷史）
-- ---------------------------------------------------------------------
create table if not exists routing_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  message_id      uuid references messages(id) on delete cascade,
  chosen_model    text not null,
  reason          text,
  has_image       boolean default false,
  has_tools       boolean default false,
  created_at      timestamptz default now()
);

alter table routing_logs enable row level security;
create policy "routing_logs: select own"
  on routing_logs for select using (auth.uid() = user_id);
create policy "routing_logs: insert own"
  on routing_logs for insert with check (auth.uid() = user_id);
