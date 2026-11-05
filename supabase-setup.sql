-- SAMORAQ V2 initial cloud schema. Run in Supabase SQL Editor.
-- Keep RLS enabled. Never place a service_role/secret key in browser code.
create table if not exists public.student_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text not null default '',
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists student_profiles_username_lower_uidx
  on public.student_profiles (lower(username));

create table if not exists public.student_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  app_state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.student_profiles enable row level security;
alter table public.student_app_state enable row level security;

 drop policy if exists "Students read own profile" on public.student_profiles;
 drop policy if exists "Students insert own profile" on public.student_profiles;
 drop policy if exists "Students update own profile" on public.student_profiles;
 drop policy if exists "Students delete own profile" on public.student_profiles;
create policy "Students read own profile" on public.student_profiles for select to authenticated using (auth.uid() = user_id);
create policy "Students insert own profile" on public.student_profiles for insert to authenticated with check (auth.uid() = user_id);
create policy "Students update own profile" on public.student_profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Students delete own profile" on public.student_profiles for delete to authenticated using (auth.uid() = user_id);

 drop policy if exists "Students read own app state" on public.student_app_state;
 drop policy if exists "Students insert own app state" on public.student_app_state;
 drop policy if exists "Students update own app state" on public.student_app_state;
 drop policy if exists "Students delete own app state" on public.student_app_state;
create policy "Students read own app state" on public.student_app_state for select to authenticated using (auth.uid() = user_id);
create policy "Students insert own app state" on public.student_app_state for insert to authenticated with check (auth.uid() = user_id);
create policy "Students update own app state" on public.student_app_state for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Students delete own app state" on public.student_app_state for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.student_profiles to authenticated;
grant select, insert, update, delete on public.student_app_state to authenticated;
