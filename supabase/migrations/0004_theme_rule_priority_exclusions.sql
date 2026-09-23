alter table theme_rules
  add column if not exists priority integer not null default 0,
  add column if not exists excludes text[] not null default '{}';
