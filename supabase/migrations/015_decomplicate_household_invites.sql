alter table public.household_invitations
  alter column email drop not null;

grant usage on schema public to authenticated;

revoke select, insert, update, delete on table public.household_invitations
  from authenticated;

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

create or replace function public.get_household_invitation(
  invitation_token uuid
)
returns table(
  invited_household_name text,
  email citext,
  expires_at timestamptz,
  accepted_at timestamptz,
  is_expired boolean
)
language sql
security definer
set search_path = public
as $$
  select
    households.name as invited_household_name,
    invitations.email,
    invitations.expires_at,
    invitations.accepted_at,
    invitations.expires_at <= now() as is_expired
  from public.household_invitations invitations
  join public.households households
    on households.id = invitations.household_id
  where invitations.token = invitation_token
  limit 1;
$$;

create or replace function public.accept_or_preview_household_invitation(
  invitation_token uuid,
  switch_and_copy boolean default false
)
returns table(
  result_status text,
  target_household_id uuid,
  current_household_name text,
  invited_household_name text,
  copied_recipe_count integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invitation record;
  current_email citext;
  current_member public.household_members;
  source_recipe record;
  source_version public.recipe_versions;
  new_recipe_id uuid;
  normalized_ingredients jsonb;
  copied_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select lower(email)::citext into current_email
  from auth.users
  where id = auth.uid();

  select
    invitations.*,
    households.name as household_name
  into invitation
  from public.household_invitations invitations
  join public.households households
    on households.id = invitations.household_id
  where invitations.token = invitation_token
  for update of invitations;

  if invitation.id is null then
    raise exception 'This invitation link is invalid.';
  end if;
  if invitation.accepted_at is not null then
    raise exception 'This invitation has already been used.';
  end if;
  if invitation.expires_at <= now() then
    raise exception 'This invitation has expired. Ask the household to send a new invite.';
  end if;
  if invitation.email is not null
    and lower(invitation.email)::citext <> current_email
  then
    raise exception
      'This invitation is for %, but you are signed in as %. Sign out and use the invited email address.',
      invitation.email,
      current_email;
  end if;

  select * into current_member
  from public.household_members
  where user_id = auth.uid()
  for update;

  if current_member.id is null then
    insert into public.household_members(
      household_id,
      user_id,
      email,
      display_name
    )
    values (
      invitation.household_id,
      auth.uid(),
      current_email,
      coalesce(
        auth.jwt()->'user_metadata'->>'display_name',
        split_part(current_email::text, '@', 1)
      )
    );

    update public.household_invitations
    set accepted_at = now()
    where id = invitation.id;

    result_status := 'accepted';
    target_household_id := invitation.household_id;
    current_household_name := null;
    invited_household_name := invitation.household_name;
    copied_recipe_count := 0;
    return next;
    return;
  end if;

  if current_member.household_id = invitation.household_id then
    update public.household_invitations
    set accepted_at = coalesce(accepted_at, now())
    where id = invitation.id;

    result_status := 'accepted';
    target_household_id := invitation.household_id;
    current_household_name := invitation.household_name;
    invited_household_name := invitation.household_name;
    copied_recipe_count := 0;
    return next;
    return;
  end if;

  select households.name into current_household_name
  from public.households households
  where households.id = current_member.household_id;

  select count(*)::integer into copied_count
  from public.recipes recipes
  where recipes.household_id = current_member.household_id
    and recipes.created_by = auth.uid();

  if not switch_and_copy then
    result_status := 'switch_required';
    target_household_id := invitation.household_id;
    invited_household_name := invitation.household_name;
    copied_recipe_count := copied_count;
    return next;
    return;
  end if;

  copied_count := 0;
  for source_recipe in
    select *
    from public.recipes recipes
    where recipes.household_id = current_member.household_id
      and recipes.created_by = auth.uid()
    order by recipes.created_at
  loop
    source_version := null;
    select * into source_version
    from public.recipe_versions
    where recipe_id = source_recipe.id
      and version = source_recipe.current_version
    limit 1;

    if source_version.id is null then
      continue;
    end if;

    normalized_ingredients :=
      private.catalogize_household_recipe_ingredients(
        invitation.household_id,
        source_version.ingredients
      );

    insert into public.recipes(
      household_id,
      title,
      description,
      source_url,
      source_creator,
      image_path,
      prep_minutes,
      cook_minutes,
      tags,
      favorite,
      visibility,
      current_version,
      created_by
    )
    values (
      invitation.household_id,
      source_recipe.title,
      source_recipe.description,
      source_recipe.source_url,
      source_recipe.source_creator,
      source_recipe.image_path,
      source_recipe.prep_minutes,
      source_recipe.cook_minutes,
      private.fixed_recipe_tags(to_jsonb(source_recipe.tags)),
      false,
      'private',
      1,
      auth.uid()
    )
    returning id into new_recipe_id;

    insert into public.recipe_versions(
      recipe_id,
      version,
      yield_count,
      ingredients,
      instructions,
      note,
      created_by
    )
    values (
      new_recipe_id,
      1,
      source_version.yield_count,
      normalized_ingredients,
      source_version.instructions,
      'Copied when joining household',
      auth.uid()
    );

    copied_count := copied_count + 1;
  end loop;

  update public.household_members
  set
    household_id = invitation.household_id,
    email = current_email,
    joined_at = now()
  where id = current_member.id;

  update public.household_invitations
  set accepted_at = now()
  where id = invitation.id;

  result_status := 'accepted';
  target_household_id := invitation.household_id;
  invited_household_name := invitation.household_name;
  copied_recipe_count := copied_count;
  return next;
end;
$$;

revoke execute on function public.create_household_invitation(text)
  from public, anon;
grant execute on function public.create_household_invitation(text)
  to authenticated;

revoke execute on function public.get_household_invitation(uuid)
  from public;
grant execute on function public.get_household_invitation(uuid)
  to anon, authenticated;

revoke execute on function public.accept_or_preview_household_invitation(uuid, boolean)
  from public, anon;
grant execute on function public.accept_or_preview_household_invitation(uuid, boolean)
  to authenticated;
