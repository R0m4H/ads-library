-- 0007's write policies call is_editor_or_owner()/is_owner() directly inside
-- USING/WITH CHECK. Postgres doesn't reliably recognize a bare function call
-- as row-invariant, so on a bulk upsert it re-runs the profiles lookup once
-- per row instead of once per statement — on a 500-row sync batch that's
-- 500 extra subqueries, slow enough to hit the database's statement
-- timeout ("canceling statement due to statement timeout").
--
-- Wrapping the call in `(select ...)` is Postgres/Supabase's documented fix:
-- it makes the planner treat the result as a constant for the statement
-- (an initplan) instead of re-evaluating it per row. Same logical policy,
-- just fast. Recreate every write policy from 0007 with that wrapping.

drop policy if exists "profiles updatable by owner" on profiles;
create policy "profiles updatable by owner" on profiles
  for update using ((select is_owner())) with check ((select is_owner()));

drop policy if exists "brands insert by editor" on brands;
drop policy if exists "brands update by editor" on brands;
drop policy if exists "brands delete by editor" on brands;
create policy "brands insert by editor" on brands
  for insert with check ((select is_editor_or_owner()));
create policy "brands update by editor" on brands
  for update using ((select is_editor_or_owner())) with check ((select is_editor_or_owner()));
create policy "brands delete by editor" on brands
  for delete using ((select is_editor_or_owner()));

drop policy if exists "ads insert by editor" on ads;
drop policy if exists "ads update by editor" on ads;
drop policy if exists "ads delete by editor" on ads;
create policy "ads insert by editor" on ads
  for insert with check ((select is_editor_or_owner()));
create policy "ads update by editor" on ads
  for update using ((select is_editor_or_owner())) with check ((select is_editor_or_owner()));
create policy "ads delete by editor" on ads
  for delete using ((select is_editor_or_owner()));

drop policy if exists "scrape_runs insert by editor" on scrape_runs;
drop policy if exists "scrape_runs update by editor" on scrape_runs;
drop policy if exists "scrape_runs delete by editor" on scrape_runs;
create policy "scrape_runs insert by editor" on scrape_runs
  for insert with check ((select is_editor_or_owner()));
create policy "scrape_runs update by editor" on scrape_runs
  for update using ((select is_editor_or_owner())) with check ((select is_editor_or_owner()));
create policy "scrape_runs delete by editor" on scrape_runs
  for delete using ((select is_editor_or_owner()));

drop policy if exists "theme_rules insert by editor" on theme_rules;
drop policy if exists "theme_rules update by editor" on theme_rules;
drop policy if exists "theme_rules delete by editor" on theme_rules;
create policy "theme_rules insert by editor" on theme_rules
  for insert with check ((select is_editor_or_owner()));
create policy "theme_rules update by editor" on theme_rules
  for update using ((select is_editor_or_owner())) with check ((select is_editor_or_owner()));
create policy "theme_rules delete by editor" on theme_rules
  for delete using ((select is_editor_or_owner()));

drop policy if exists "sync_presets insert by editor" on sync_presets;
drop policy if exists "sync_presets update by editor" on sync_presets;
drop policy if exists "sync_presets delete by editor" on sync_presets;
create policy "sync_presets insert by editor" on sync_presets
  for insert with check ((select is_editor_or_owner()));
create policy "sync_presets update by editor" on sync_presets
  for update using ((select is_editor_or_owner())) with check ((select is_editor_or_owner()));
create policy "sync_presets delete by editor" on sync_presets
  for delete using ((select is_editor_or_owner()));
