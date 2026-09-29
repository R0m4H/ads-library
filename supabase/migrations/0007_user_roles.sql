-- User roles: "viewer" (read + filter + generate comparisons/AI insights),
-- "editor" (viewer + manage brands/syncs/themes), "owner" (editor + manage
-- everyone's role via the Team page). Enforced here via RLS so it holds
-- even if an app route forgets to check — the app layer also checks role
-- for actions that aren't plain table writes (starting an Apify sync,
-- calling Gemini), which RLS can't cover.

alter table profiles
  add column if not exists role text not null default 'viewer' check (role in ('viewer', 'editor', 'owner'));

-- Existing accounts predate roles entirely — grandfather them in as owner so
-- nobody loses access when this ships. Only signups from this point on
-- default to viewer.
update profiles set role = 'owner';

-- security definer so these can be called from RLS policies — including on
-- `profiles` itself — without the policy recursing back through RLS.
create or replace function is_editor_or_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role from profiles where id = auth.uid()) in ('editor', 'owner'), false);
$$;

create or replace function is_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role from profiles where id = auth.uid()) = 'owner', false);
$$;

-- profiles: reading the team list stays open to any signed-in member;
-- only an owner can change someone's role.
create policy "profiles updatable by owner" on profiles
  for update using (is_owner()) with check (is_owner());

-- brands: read stays open to everyone signed in; writes need editor+.
drop policy if exists "brands rw by authenticated" on brands;
create policy "brands select by authenticated" on brands
  for select using (auth.role() = 'authenticated');
create policy "brands insert by editor" on brands
  for insert with check (is_editor_or_owner());
create policy "brands update by editor" on brands
  for update using (is_editor_or_owner()) with check (is_editor_or_owner());
create policy "brands delete by editor" on brands
  for delete using (is_editor_or_owner());

-- ads: same split.
drop policy if exists "ads rw by authenticated" on ads;
create policy "ads select by authenticated" on ads
  for select using (auth.role() = 'authenticated');
create policy "ads insert by editor" on ads
  for insert with check (is_editor_or_owner());
create policy "ads update by editor" on ads
  for update using (is_editor_or_owner()) with check (is_editor_or_owner());
create policy "ads delete by editor" on ads
  for delete using (is_editor_or_owner());

-- scrape_runs: same split.
drop policy if exists "scrape_runs rw by authenticated" on scrape_runs;
create policy "scrape_runs select by authenticated" on scrape_runs
  for select using (auth.role() = 'authenticated');
create policy "scrape_runs insert by editor" on scrape_runs
  for insert with check (is_editor_or_owner());
create policy "scrape_runs update by editor" on scrape_runs
  for update using (is_editor_or_owner()) with check (is_editor_or_owner());
create policy "scrape_runs delete by editor" on scrape_runs
  for delete using (is_editor_or_owner());

-- theme_rules: same split.
drop policy if exists "theme_rules rw by authenticated" on theme_rules;
create policy "theme_rules select by authenticated" on theme_rules
  for select using (auth.role() = 'authenticated');
create policy "theme_rules insert by editor" on theme_rules
  for insert with check (is_editor_or_owner());
create policy "theme_rules update by editor" on theme_rules
  for update using (is_editor_or_owner()) with check (is_editor_or_owner());
create policy "theme_rules delete by editor" on theme_rules
  for delete using (is_editor_or_owner());

-- sync_presets: same split.
drop policy if exists "sync_presets rw by authenticated" on sync_presets;
create policy "sync_presets select by authenticated" on sync_presets
  for select using (auth.role() = 'authenticated');
create policy "sync_presets insert by editor" on sync_presets
  for insert with check (is_editor_or_owner());
create policy "sync_presets update by editor" on sync_presets
  for update using (is_editor_or_owner()) with check (is_editor_or_owner());
create policy "sync_presets delete by editor" on sync_presets
  for delete using (is_editor_or_owner());
