-- Run once in the Supabase SQL Editor for this project.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.papers (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  page_count integer not null default 0,
  summary text not null default '',
  analysis jsonb not null default '{}'::jsonb,
  extracted_text text not null default '',
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete cascade,
  title text not null,
  language text not null default 'English',
  sections jsonb not null default '[]'::jsonb,
  storage_path text not null,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.profiles, public.papers, public.chat_messages, public.reports to authenticated;

alter table public.profiles enable row level security;
alter table public.papers enable row level security;
alter table public.chat_messages enable row level security;
alter table public.reports enable row level security;

drop policy if exists "profile owner access" on public.profiles;
drop policy if exists "paper owner access" on public.papers;
drop policy if exists "chat owner access" on public.chat_messages;
drop policy if exists "report owner access" on public.reports;
create policy "profile owner access" on public.profiles for all to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "paper owner access" on public.papers for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "chat owner access" on public.chat_messages for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "report owner access" on public.reports for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do update set email = excluded.email, full_name = excluded.full_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('research-papers', 'research-papers', false, 31457280, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 31457280, allowed_mime_types = array['application/pdf'];

drop policy if exists "user files are private" on storage.objects;
drop policy if exists "users upload their own files" on storage.objects;
drop policy if exists "users update their own files" on storage.objects;
create policy "user files are private" on storage.objects for select to authenticated
using (bucket_id = 'research-papers' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users upload their own files" on storage.objects for insert to authenticated
with check (bucket_id = 'research-papers' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users update their own files" on storage.objects for update to authenticated
using (bucket_id = 'research-papers' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'research-papers' and (storage.foldername(name))[1] = (select auth.uid())::text);
