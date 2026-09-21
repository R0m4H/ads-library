-- Ad Intel MVP schema
-- Run this in the Supabase SQL editor (or via `supabase db push`) on a fresh project.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: one row per team member (mirrors auth.users)
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ---------------------------------------------------------------------------
-- brands: your own brand(s) + competitors you track
-- ---------------------------------------------------------------------------
create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_own boolean not null default false,
  category text,
  notes text,
  logo_url text,
  meta_page_id text,
  meta_page_url text,
  google_advertiser_id text,
  google_domain text,
  tiktok_handle text,
  linkedin_company_url text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brands_is_own_idx on brands (is_own);

-- ---------------------------------------------------------------------------
-- ads: one row per unique ad creative per platform
-- ---------------------------------------------------------------------------
create table if not exists ads (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands (id) on delete cascade,
  platform text not null check (platform in ('meta', 'google', 'tiktok', 'linkedin')),
  external_id text not null,
  ad_format text, -- image | video | carousel | text
  headline text,
  body text,
  cta text,
  media jsonb not null default '[]'::jsonb, -- [{type: 'image'|'video', url, thumbnail_url}]
  landing_url text,
  source_url text, -- deep link back to the platform's own ad library entry
  theme_tags text[] not null default '{}',
  spend_estimate text,
  impressions_estimate text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_active boolean not null default true,
  raw jsonb,
  search_vector tsvector generated always as (
    to_tsvector('english',
      coalesce(headline, '') || ' ' || coalesce(body, '') || ' ' || coalesce(cta, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, platform, external_id)
);

create index if not exists ads_brand_idx on ads (brand_id);
create index if not exists ads_platform_idx on ads (platform);
create index if not exists ads_is_active_idx on ads (is_active);
create index if not exists ads_theme_tags_idx on ads using gin (theme_tags);
create index if not exists ads_search_idx on ads using gin (search_vector);

-- ---------------------------------------------------------------------------
-- scrape_runs: audit trail of every Apify sync
-- ---------------------------------------------------------------------------
create table if not exists scrape_runs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands (id) on delete cascade,
  platform text not null check (platform in ('meta', 'google', 'tiktok', 'linkedin')),
  apify_run_id text,
  apify_dataset_id text,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  ads_found int,
  ads_active int,
  error text,
  started_by uuid references profiles (id),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists scrape_runs_brand_idx on scrape_runs (brand_id);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists brands_set_updated_at on brands;
create trigger brands_set_updated_at before update on brands
  for each row execute procedure set_updated_at();

drop trigger if exists ads_set_updated_at on ads;
create trigger ads_set_updated_at before update on ads
  for each row execute procedure set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: any signed-in team member can read/write everything.
-- This is a shared internal tool, not multi-tenant, so policies are simple.
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table brands enable row level security;
alter table ads enable row level security;
alter table scrape_runs enable row level security;

create policy "profiles readable by authenticated" on profiles
  for select using (auth.role() = 'authenticated');

create policy "brands rw by authenticated" on brands
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "ads rw by authenticated" on ads
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "scrape_runs rw by authenticated" on scrape_runs
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
