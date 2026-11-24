
create table if not exists public.bunime_sync (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);

revoke all on public.bunime_sync from anon;
grant select, insert, update, delete on public.bunime_sync to authenticated;

alter table public.bunime_sync enable row level security;

drop policy if exists "read own list"   on public.bunime_sync;
drop policy if exists "create own list" on public.bunime_sync;
drop policy if exists "update own list" on public.bunime_sync;
drop policy if exists "delete own list" on public.bunime_sync;

create policy "read own list"   on public.bunime_sync for select using (auth.uid() = user_id);
create policy "create own list" on public.bunime_sync for insert with check (auth.uid() = user_id);
create policy "update own list" on public.bunime_sync for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own list" on public.bunime_sync for delete using (auth.uid() = user_id);

alter table public.bunime_sync drop constraint if exists bunime_sync_size;
alter table public.bunime_sync add constraint bunime_sync_size check (pg_column_size(data) < 2000000);
