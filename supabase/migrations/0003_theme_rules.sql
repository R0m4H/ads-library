-- User-managed theme classification rules. Replaces the old hardcoded
-- English keyword classifier — ads get tagged by matching these
-- user-defined keywords instead.

create table if not exists theme_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  keywords text[] not null default '{}',
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists theme_rules_set_updated_at on theme_rules;
create trigger theme_rules_set_updated_at before update on theme_rules
  for each row execute procedure set_updated_at();

alter table theme_rules enable row level security;

create policy "theme_rules rw by authenticated" on theme_rules
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
