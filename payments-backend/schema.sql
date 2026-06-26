-- Ante Phase 1 schema. Applied to Supabase via tracked migration.
-- Identity = auth.users(id). RLS isolates every user to their own rows.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  handle text unique,
  reminder_time text,
  reminder_on boolean default false,
  updated_at timestamptz not null default now()
);

create table if not exists habits (
  id text primary key,                       -- client-generated id
  user_id uuid not null references auth.users(id) on delete cascade,
  name text, emoji text, icon text, color text, category text,
  source text, metric text, dir text,
  target numeric, unit text, verify text,
  apps jsonb default '[]'::jsonb, cap_minutes int,
  freq text, stake numeric, destination text, escalate boolean default false,
  completed_days jsonb default '[]'::jsonb,
  missed_days jsonb default '[]'::jsonb,
  current_streak int default 0, best_streak int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists habits_user_idx on habits(user_id);

create table if not exists transactions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text, "desc" text, amount numeric, type text,
  created_at timestamptz default now()
);
create index if not exists transactions_user_idx on transactions(user_id);

-- Server-authoritative (written only by the backend service role).
create table if not exists stripe_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text, default_pm text,
  updated_at timestamptz not null default now()
);

create table if not exists stakes (
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id text not null,
  amount_cents int not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, habit_id)
);

-- ---- RLS ----
alter table profiles        enable row level security;
alter table habits          enable row level security;
alter table transactions    enable row level security;
alter table stripe_customers enable row level security;
alter table stakes          enable row level security;

create policy profiles_owner on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy habits_owner on habits
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy transactions_owner on transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Read-own-only; NO insert/update/delete policy -> clients can't write.
-- The service-role key bypasses RLS for backend writes.
create policy stripe_customers_read on stripe_customers
  for select using (user_id = auth.uid());
create policy stakes_read on stakes
  for select using (user_id = auth.uid());
