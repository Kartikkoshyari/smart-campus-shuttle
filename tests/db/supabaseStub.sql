-- A tiny stand-in for the parts of Supabase the migrations rely on, so the
-- real migration files can be tested in an embedded PostgreSQL (PGlite)
-- without an internet connection. This file is for tests only; never run it
-- on your Supabase project, which already has all of this.

create role anon nologin;
create role authenticated nologin;

create schema auth;

create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Supabase reads the user ID from the request's access token. Tests set it with
-- set_config('request.jwt.claim.sub', '<uuid>', false).
create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;

create publication supabase_realtime;
