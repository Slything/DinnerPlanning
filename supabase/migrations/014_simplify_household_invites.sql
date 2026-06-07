alter table public.household_invitations
  alter column email drop not null;

grant usage on schema public to authenticated;

create or replace function public.create_household_invitation(
  invite_email text default null
)
returns table(
  id uuid,
  email citext,
  token uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  household uuid := private.current_household_id();
  normalized_email citext := nullif(lower(trim(invite_email)), '')::citext;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if household is null then
    raise exception 'Household membership required';
  end if;

  return query
  insert into public.household_invitations(
    household_id,
    email,
    invited_by
  )
  values (
    household,
    normalized_email,
    auth.uid()
  )
  returning
    household_invitations.id,
    household_invitations.email,
    household_invitations.token,
    household_invitations.expires_at;
end;
$$;

revoke execute on function public.create_household_invitation(text)
  from public, anon;
grant execute on function public.create_household_invitation(text)
  to authenticated;
