alter table public.household_invitations
  alter column email drop not null;

create or replace function public.accept_household_invitation(
  invitation_token uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invitation public.household_invitations;
  current_email citext;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if exists (
    select 1 from public.household_members where user_id = auth.uid()
  ) then
    raise exception 'User already belongs to a household';
  end if;

  select lower(email)::citext into current_email
  from auth.users where id = auth.uid();

  select * into invitation
  from public.household_invitations
  where token = invitation_token
  for update;

  if invitation.id is null
    or invitation.accepted_at is not null
    or invitation.expires_at <= now()
    or (
      invitation.email is not null
      and lower(invitation.email)::citext <> current_email
    )
  then
    raise exception 'Invitation is invalid, expired, or belongs to another email';
  end if;

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

  return invitation.household_id;
end;
$$;

create or replace function public.switch_household_from_invitation(
  invitation_token uuid
)
returns table(household_id uuid, copied_recipe_count integer)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invitation public.household_invitations;
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

  select * into invitation
  from public.household_invitations
  where token = invitation_token
  for update;

  if invitation.id is null
    or invitation.accepted_at is not null
    or invitation.expires_at <= now()
    or (
      invitation.email is not null
      and lower(invitation.email)::citext <> current_email
    )
  then
    raise exception 'Invitation is invalid, expired, or belongs to another email';
  end if;

  select * into current_member
  from public.household_members
  where user_id = auth.uid()
  for update;

  if current_member.id is null then
    raise exception 'Use regular invite acceptance for accounts without a household';
  end if;

  if current_member.household_id = invitation.household_id then
    update public.household_invitations
    set accepted_at = coalesce(accepted_at, now())
    where id = invitation.id;
    household_id := invitation.household_id;
    copied_recipe_count := 0;
    return next;
    return;
  end if;

  for source_recipe in
    select *
    from public.recipes recipes
    where recipes.household_id = current_member.household_id
      and recipes.created_by = auth.uid()
    order by recipes.created_at
  loop
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

  household_id := invitation.household_id;
  copied_recipe_count := copied_count;
  return next;
end;
$$;

grant execute on function public.accept_household_invitation(uuid)
  to authenticated;
grant execute on function public.switch_household_from_invitation(uuid)
  to authenticated;
