grant usage on schema public to authenticated;

grant select, insert, update, delete on table public.household_invitations
  to authenticated;

grant select on table public.households
  to authenticated;

grant select on table public.household_members
  to authenticated;
