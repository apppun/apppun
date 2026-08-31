-- Fix the public registered-taxpayer counter without exposing profile PII.
-- The frontend only needs to count rows via SELECT id.
drop policy if exists profiles_select_own on public.profiles;

create policy profiles_select_count on public.profiles
  for select to public
  using (true);

revoke select on public.profiles from anon, authenticated;
grant select (id) on public.profiles to anon, authenticated;
