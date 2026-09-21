-- Storage bucket for uploaded brand logos.
-- Run this in the Supabase SQL editor after 0001_init.sql.
-- NOTE: bucket name is "Logos" (created via the Storage dashboard UI on
-- this project — if creating fresh elsewhere, either match this name or
-- update LOGO_BUCKET in src/components/LogoUploader.tsx to match yours).

insert into storage.buckets (id, name, public)
values ('Logos', 'Logos', true)
on conflict (id) do nothing;

-- Public bucket: logo files are served directly as <img src> with no auth,
-- same as any other logo_url. Only signed-in team members can write.
create policy "brand logos public read" on storage.objects
  for select using (bucket_id = 'Logos');

create policy "brand logos insert by authenticated" on storage.objects
  for insert to authenticated with check (bucket_id = 'Logos');

create policy "brand logos update by authenticated" on storage.objects
  for update to authenticated using (bucket_id = 'Logos');

create policy "brand logos delete by authenticated" on storage.objects
  for delete to authenticated using (bucket_id = 'Logos');
