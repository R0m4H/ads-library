-- Only allow new accounts whose email is on an approved company domain.
--
-- Enforced in the database (a BEFORE INSERT trigger on auth.users) so it cannot be
-- bypassed by calling the Supabase Auth API directly. It applies to every way an
-- account can be created: the sign-up page, the dashboard's "Add user", and invites.
-- Existing accounts are untouched.
--
-- This only means something together with "Confirm email" switched ON in
-- Supabase (Authentication → Sign In / Providers → Email); otherwise anyone can
-- type an address they don't own.
--
-- To allow another domain later, no migration is needed:
--   insert into allowed_signup_domains (domain) values ('example.com');

create table if not exists allowed_signup_domains (
  domain text primary key check (domain = lower(domain) and domain !~ '[@\s]')
);

-- Not meant to be read or written from the browser; only the trigger function (security
-- definer) and the SQL editor use it. RLS on with no policies = no access via the API.
alter table allowed_signup_domains enable row level security;

insert into allowed_signup_domains (domain) values ('bog.ge') on conflict do nothing;

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
    raise exception 'Sign-up is restricted to approved company email addresses.';
  end if;

  dom := split_part(addr, '@', 2);

  if not exists (select 1 from allowed_signup_domains where domain = dom) then
    raise exception 'Sign-up is restricted to approved company email addresses.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_signup_domain on auth.users;
create trigger enforce_signup_domain
  before insert on auth.users
  for each row execute function public.enforce_signup_domain();
