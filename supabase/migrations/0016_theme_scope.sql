-- Themes can be limited to chosen pages (brands) instead of applying to every page.
--   brand_ids = '{}'   (empty) -> a general theme: applies to all pages (everything that exists today)
--   brand_ids = {a, b}         -> only the ads of pages a and b are tagged with it
-- A page's own theme overrides a general theme of the same name for that page.
--
-- Safe to run whether or not an earlier single-page version of this migration (a "brand_id" column) was run.
alter table theme_rules add column if not exists brand_ids uuid[] not null default '{}';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'theme_rules' and column_name = 'brand_id'
  ) then
    -- carry the old single page over, then drop the old column (and its foreign key)
    update theme_rules set brand_ids = array[brand_id] where brand_id is not null and brand_ids = '{}';
    alter table theme_rules drop column brand_id;
  end if;
end $$;

-- Names used to be unique across the whole table. With scopes that can overlap, the app checks for a clash
-- (two themes with the same name that apply to the same page) when a theme is saved instead.
alter table theme_rules drop constraint if exists theme_rules_name_key;
drop index if exists theme_rules_scope_name_key;

-- When a page is deleted, take it out of every theme's page list. A theme that was only for that page is
-- deleted with it (an empty list would otherwise turn it into a general theme that applies everywhere).
create or replace function public.remove_brand_from_theme_scopes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from theme_rules where brand_ids = array[old.id];
  update theme_rules set brand_ids = array_remove(brand_ids, old.id) where old.id = any (brand_ids);
  return old;
end;
$$;

drop trigger if exists brands_remove_theme_scopes on brands;
create trigger brands_remove_theme_scopes
  before delete on brands
  for each row execute function public.remove_brand_from_theme_scopes();

-- Make the new column visible to the API straight away.
notify pgrst, 'reload schema';
