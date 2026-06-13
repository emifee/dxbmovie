-- =============================================================================
-- DXBmovies.Ai — Initial schema
-- PostgreSQL / Supabase
--
-- Run order matters: extensions -> tables -> indexes -> RLS -> policies ->
-- triggers. Designed to be idempotent where practical so it can be re-applied
-- against a fresh project without manual cleanup.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- =============================================================================
-- TABLE: profiles
-- One row per authenticated user. id mirrors auth.users.id (1:1).
-- Populated automatically on signup via the handle_new_user() trigger below.
-- =============================================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text,
  display_name text,
  avatar_url   text,
  is_premium   boolean     not null default false,
  created_at   timestamptz not null default now()
);

comment on table public.profiles is 'Public user profile, 1:1 with auth.users.';

-- =============================================================================
-- TABLE: user_preferences
-- Streaming services + favorite genres captured during onboarding and edited
-- from the profile page. One row per user (enforced by unique user_id).
-- favorite_genres holds TMDB genre IDs as text; streaming_services holds slugs
-- (netflix, shahid, osn, starzplay, prime, apple).
-- =============================================================================
create table if not exists public.user_preferences (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null unique references public.profiles (id) on delete cascade,
  favorite_genres    text[] not null default '{}',
  streaming_services text[] not null default '{}',
  updated_at         timestamptz not null default now()
);

comment on table public.user_preferences is 'Per-user onboarding prefs powering AI recommendations.';

-- =============================================================================
-- TABLE: chat_sessions
-- A single conversation thread with the DXB AI companion. title is
-- auto-generated from the first user message.
-- =============================================================================
create table if not exists public.chat_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.chat_sessions is 'A conversation thread with the DXB AI companion.';

-- =============================================================================
-- TABLE: chat_messages
-- Individual messages inside a session. role is 'user' or 'assistant'.
-- Persisted so returning users resume exactly where they left off (no
-- in-memory conversation state).
-- =============================================================================
create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);

comment on table public.chat_messages is 'Messages within a chat_session.';

-- =============================================================================
-- TABLE: watchlist
-- Movies/shows a user saved. (user_id, tmdb_id, media_type) is unique so the
-- same title cannot be added twice; lets the API use upsert/delete cleanly.
-- =============================================================================
create table if not exists public.watchlist (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  tmdb_id     integer not null,
  media_type  text not null default 'movie' check (media_type in ('movie', 'tv')),
  title       text,
  poster_path text,
  added_at    timestamptz not null default now(),
  unique (user_id, tmdb_id, media_type)
);

comment on table public.watchlist is 'User-saved movies/shows.';

-- =============================================================================
-- TABLE: movie_interactions
-- Append-only log of every meaningful interaction with a title. Aggregated by
-- /api/profile/taste to build the "Movie DNA" profile. genre_ids holds TMDB
-- genre IDs for the title so taste can be computed without re-fetching TMDB.
-- =============================================================================
create table if not exists public.movie_interactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  tmdb_id          integer not null,
  interaction_type text not null check (interaction_type in ('viewed', 'discussed', 'recommended')),
  genre_ids        text[] not null default '{}',
  created_at       timestamptz not null default now()
);

comment on table public.movie_interactions is 'Append-only interaction log powering the Movie DNA taste profile.';

-- ---------------------------------------------------------------------------
-- Indexes (foreign keys + common access patterns)
-- ---------------------------------------------------------------------------
create index if not exists idx_chat_sessions_user        on public.chat_sessions (user_id, updated_at desc);
create index if not exists idx_chat_messages_session     on public.chat_messages (session_id, created_at);
create index if not exists idx_watchlist_user            on public.watchlist (user_id, added_at desc);
create index if not exists idx_movie_interactions_user   on public.movie_interactions (user_id, created_at desc);

-- =============================================================================
-- ROW LEVEL SECURITY
-- Every table is owner-scoped: a user can only see/modify rows tied to their
-- auth.uid(). chat_messages is scoped indirectly through its parent session.
-- =============================================================================
alter table public.profiles           enable row level security;
alter table public.user_preferences   enable row level security;
alter table public.chat_sessions      enable row level security;
alter table public.chat_messages      enable row level security;
alter table public.watchlist          enable row level security;
alter table public.movie_interactions enable row level security;

-- ---- profiles -------------------------------------------------------------
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---- user_preferences -----------------------------------------------------
create policy "prefs_select_own" on public.user_preferences
  for select using (auth.uid() = user_id);
create policy "prefs_insert_own" on public.user_preferences
  for insert with check (auth.uid() = user_id);
create policy "prefs_update_own" on public.user_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- chat_sessions --------------------------------------------------------
create policy "sessions_select_own" on public.chat_sessions
  for select using (auth.uid() = user_id);
create policy "sessions_insert_own" on public.chat_sessions
  for insert with check (auth.uid() = user_id);
create policy "sessions_update_own" on public.chat_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sessions_delete_own" on public.chat_sessions
  for delete using (auth.uid() = user_id);

-- ---- chat_messages (scoped via parent session) ----------------------------
create policy "messages_select_own" on public.chat_messages
  for select using (
    exists (
      select 1 from public.chat_sessions s
      where s.id = chat_messages.session_id and s.user_id = auth.uid()
    )
  );
create policy "messages_insert_own" on public.chat_messages
  for insert with check (
    exists (
      select 1 from public.chat_sessions s
      where s.id = chat_messages.session_id and s.user_id = auth.uid()
    )
  );

-- ---- watchlist ------------------------------------------------------------
create policy "watchlist_select_own" on public.watchlist
  for select using (auth.uid() = user_id);
create policy "watchlist_insert_own" on public.watchlist
  for insert with check (auth.uid() = user_id);
create policy "watchlist_delete_own" on public.watchlist
  for delete using (auth.uid() = user_id);

-- ---- movie_interactions ---------------------------------------------------
create policy "interactions_select_own" on public.movie_interactions
  for select using (auth.uid() = user_id);
create policy "interactions_insert_own" on public.movie_interactions
  for insert with check (auth.uid() = user_id);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-create a profile row when a new auth user is created. Pulls name/avatar
-- from the Google OAuth identity metadata. SECURITY DEFINER so it can write to
-- public.profiles despite RLS during the auth flow.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(
      split_part(new.raw_user_meta_data ->> 'full_name', ' ', 1),
      split_part(new.raw_user_meta_data ->> 'name', ' ', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at fresh on mutable tables.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_prefs_updated_at on public.user_preferences;
create trigger trg_prefs_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

drop trigger if exists trg_sessions_updated_at on public.chat_sessions;
create trigger trg_sessions_updated_at
  before update on public.chat_sessions
  for each row execute function public.set_updated_at();
