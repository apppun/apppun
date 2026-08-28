create table if not exists public.app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

create policy "Users can read own app state" on public.app_state
  for select using (auth.uid() = user_id);
create policy "Users can insert own app state" on public.app_state
  for insert with check (auth.uid() = user_id);
create policy "Users can update own app state" on public.app_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.app_state replica identity full;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.app_state;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
