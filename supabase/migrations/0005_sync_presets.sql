create table if not exists sync_presets (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  value integer not null check (value > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists sync_presets_set_updated_at on sync_presets;
create trigger sync_presets_set_updated_at before update on sync_presets
  for each row execute procedure set_updated_at();

alter table sync_presets enable row level security;

create policy "sync_presets rw by authenticated" on sync_presets
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into sync_presets (label, value, sort_order)
select * from (values
  ('Quick', 50, 0),
  ('Standard', 200, 1),
  ('Full', 1000, 2)
) as defaults(label, value, sort_order)
where not exists (select 1 from sync_presets);
