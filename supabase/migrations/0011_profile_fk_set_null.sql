-- Deleting a user in Supabase Auth cascades to their profiles row, but
-- brands.created_by, scrape_runs.started_by and theme_rules.created_by all
-- reference profiles(id) with no ON DELETE action, so Postgres blocks the
-- delete whenever that user ever created a brand, started a sync or added
-- a theme ("Database error deleting user"). Keep the brands/runs/themes
-- themselves and just clear the "who created it" pointer.

alter table brands drop constraint if exists brands_created_by_fkey;
alter table brands
  add constraint brands_created_by_fkey foreign key (created_by) references profiles (id) on delete set null;

alter table scrape_runs drop constraint if exists scrape_runs_started_by_fkey;
alter table scrape_runs
  add constraint scrape_runs_started_by_fkey foreign key (started_by) references profiles (id) on delete set null;

alter table theme_rules drop constraint if exists theme_rules_created_by_fkey;
alter table theme_rules
  add constraint theme_rules_created_by_fkey foreign key (created_by) references profiles (id) on delete set null;
