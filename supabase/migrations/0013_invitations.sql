-- Invitations: an owner can let a specific outside address (e.g. a Gmail account) create an account,
-- and choose its role in advance. Everyone else outside the approved domains (0012) is still refused.
--
-- Flow: owner adds the address on the Team page → the person opens the site, uses "Sign up" with
-- exactly that address and picks their own password → the account is created with the invited role and
-- the invitation is used up. Revoking = deleting the row before they sign up.

create table if not exists invitations (
  email text primary key check (email = lower(email)),
  role text not null default 'viewer' check (role in ('viewer', 'editor', 'owner')),
  invited_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table invitations enable row level security;

-- Owners only. (The sign-up checks below run as security definer, so they do not need these.)
drop policy if exists "invitations select by owner" on invitations;
drop policy if exists "invitations insert by owner" on invitations;
drop policy if exists "invitations update by owner" on invitations;
drop policy if exists "invitations delete by owner" on invitations;
create policy "invitations select by owner" on invitations
  for select using ((select is_owner()));
create policy "invitations insert by owner" on invitations
  for insert with check ((select is_owner()));
create policy "invitations update by owner" on invitations
  for update using ((select is_owner())) with check ((select is_owner()));
create policy "invitations delete by owner" on invitations
  for delete using ((select is_owner()));

-- Sign-up gate (replaces the one from 0012): approved domain OR a pending invitation for this exact address.
create or replace function public.enforce_signup_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  addr text := lower(trim(coalesce(new.email, '')));
  dom  text;
begin
  -- Exactly one "@", and take what follows it. "a@evil.com@bog.ge" has two and is rejected.
  if addr = '' or array_length(string_to_array(addr, '@'), 1) <> 2 then
    raise exception 'Sign-up is restricted to approved company email addresses or invited people.';
  end if;

  dom := split_part(addr, '@', 2);

  if exists (select 1 from allowed_signup_domains where domain = dom)
     or exists (select 1 from invitations where email = addr) then
    return new;
  end if;

  raise exception 'Sign-up is restricted to approved company email addresses or invited people.';
end;
$$;

-- New profile: take the invited role (if any) and use the invitation up. Replaces the one from 0001.
create or replace function handle_new_user()
returns trigger as $$
declare
  addr text := lower(trim(coalesce(new.email, '')));
  invited_role text;
begin
  select role into invited_role from public.invitations where email = addr;

  insert into public.profiles (id, email, display_name, role)
  values (new.id, new.email, split_part(new.email, '@', 1), coalesce(invited_role, 'viewer'));

  delete from public.invitations where email = addr;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
