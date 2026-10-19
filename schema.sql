-- Herat University English Class Portal
-- Run in Supabase SQL Editor. This script is designed to be safe to re-run.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Class member',
  role text not null default 'student' check (role in ('admin','editor','student')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'Class member'),
    'student'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_class_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','editor')
  );
$$;

create or replace function public.is_class_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  category text not null default 'اطلاعیه',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  kind text not null default 'assignment' check (kind in ('assignment','exam')),
  due_date date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.timetable (
  id uuid primary key default gen_random_uuid(),
  day text not null,
  time text not null,
  subject text not null,
  teacher_room text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.class_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  members jsonb not null default '[]'::jsonb check (jsonb_typeof(members) = 'array'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.course_files (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  file_name text not null,
  storage_path text not null,
  url text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.announcements enable row level security;
alter table public.assignments enable row level security;
alter table public.timetable enable row level security;
alter table public.class_groups enable row level security;
alter table public.course_files enable row level security;

-- Profiles are not public; signed-in users may see their own profile.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_class_admin());
drop policy if exists "admin update profiles" on public.profiles;
create policy "admin update profiles" on public.profiles for update to authenticated
using (public.is_class_admin()) with check (public.is_class_admin());
drop policy if exists "admin insert profiles" on public.profiles;
create policy "admin insert profiles" on public.profiles for insert to authenticated
with check (public.is_class_admin());

-- Public class data is readable by anyone; only authorized editors can change it.
do $$
declare t text;
begin
  foreach t in array array['announcements','assignments','timetable','class_groups','course_files'] loop
    execute format('drop policy if exists "public read %1$s" on public.%1$I', t);
    execute format('create policy "public read %1$s" on public.%1$I for select to anon, authenticated using (true)', t);
    execute format('drop policy if exists "edit %1$s" on public.%1$I', t);
    execute format('create policy "edit %1$s" on public.%1$I for all to authenticated using (public.is_class_editor()) with check (public.is_class_editor())', t);
  end loop;
end $$;

-- Storage bucket for publicly downloadable class materials. Limit files to 15 MiB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-files', 'course-files', true, 15728640,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain','image/jpeg','image/png']
)
on conflict (id) do update set public = true, file_size_limit = 15728640;

drop policy if exists "public read course files" on storage.objects;
create policy "public read course files" on storage.objects
for select to anon, authenticated using (bucket_id = 'course-files');
drop policy if exists "edit course files" on storage.objects;
create policy "edit course files" on storage.objects
for insert to authenticated with check (bucket_id = 'course-files' and public.is_class_editor());
drop policy if exists "update course files" on storage.objects;
create policy "update course files" on storage.objects
for update to authenticated using (bucket_id = 'course-files' and public.is_class_editor())
with check (bucket_id = 'course-files' and public.is_class_editor());
drop policy if exists "delete course files" on storage.objects;
create policy "delete course files" on storage.objects
for delete to authenticated using (bucket_id = 'course-files' and public.is_class_editor());

grant usage on schema public to anon, authenticated;
grant select on public.announcements, public.assignments, public.timetable, public.class_groups, public.course_files to anon, authenticated;
grant insert, update, delete on public.announcements, public.assignments, public.timetable, public.class_groups, public.course_files to authenticated;
grant select, update, insert on public.profiles to authenticated;
grant execute on function public.is_class_editor() to anon, authenticated;
grant execute on function public.is_class_admin() to anon, authenticated;
