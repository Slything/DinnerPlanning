create or replace function private.recipe_snapshot(
  target_recipe uuid,
  target_version integer
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'title', recipes.title,
    'description', recipes.description,
    'sourceUrl', recipes.source_url,
    'sourceCreator', recipes.source_creator,
    'imageUrl', recipes.image_path,
    'prepMinutes', recipes.prep_minutes,
    'cookMinutes', recipes.cook_minutes,
    'tags', recipes.tags,
    'yield', versions.yield_count,
    'ingredients', versions.ingredients,
    'instructions', versions.instructions,
    'attributionHousehold', households.name
  )
  from public.recipes recipes
  join public.recipe_versions versions
    on versions.recipe_id = recipes.id
   and versions.version = target_version
  join public.households households on households.id = recipes.household_id
  where recipes.id = target_recipe;
$$;

create or replace function public.set_recipe_visibility(
  target_recipe uuid,
  next_visibility text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  recipe public.recipes;
  public_share uuid;
begin
  if next_visibility not in ('private', 'public') then
    raise exception 'Visibility must be private or public';
  end if;
  select * into recipe from public.recipes
  where id = target_recipe for update;
  if recipe.id is null
    or not private.is_household_member(recipe.household_id)
  then
    raise exception 'Recipe not found';
  end if;

  if next_visibility = 'public' then
    update public.recipes
    set
      visibility = 'public',
      published_version = current_version,
      published_at = now()
    where id = recipe.id;

    insert into public.recipe_shares(
      source_recipe_id,
      source_household_id,
      kind,
      active,
      created_by
    )
    values (
      recipe.id,
      recipe.household_id,
      'public',
      true,
      auth.uid()
    )
    on conflict (source_recipe_id) where kind = 'public'
    do update set active = true
    returning id into public_share;

    insert into public.recipe_share_revisions(
      share_id,
      source_recipe_id,
      source_version,
      snapshot
    )
    values (
      public_share,
      recipe.id,
      recipe.current_version,
      private.recipe_snapshot(recipe.id, recipe.current_version)
    )
    on conflict (share_id, source_version) do nothing;
  else
    update public.recipes
    set visibility = 'private', published_at = null
    where id = recipe.id;
    update public.recipe_shares
    set active = false
    where source_recipe_id = recipe.id and kind = 'public';
    public_share := null;
  end if;
  return public_share;
end;
$$;

create or replace function public.create_private_recipe_share(
  target_recipe uuid,
  target_email text
)
returns table(share_id uuid, share_token uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  recipe public.recipes;
  created_share public.recipe_shares;
begin
  select * into recipe from public.recipes where id = target_recipe;
  if recipe.id is null
    or not private.is_household_member(recipe.household_id)
  then
    raise exception 'Recipe not found';
  end if;
  if nullif(trim(target_email), '') is null then
    raise exception 'Recipient email is required';
  end if;

  insert into public.recipe_shares(
    source_recipe_id,
    source_household_id,
    recipient_email,
    kind,
    active,
    expires_at,
    created_by
  )
  values (
    recipe.id,
    recipe.household_id,
    lower(trim(target_email))::citext,
    'private',
    true,
    now() + interval '7 days',
    auth.uid()
  )
  returning * into created_share;

  insert into public.recipe_share_revisions(
    share_id,
    source_recipe_id,
    source_version,
    snapshot
  )
  values (
    created_share.id,
    recipe.id,
    recipe.current_version,
    private.recipe_snapshot(recipe.id, recipe.current_version)
  );

  return query select
    created_share.id,
    created_share.token,
    created_share.expires_at;
end;
$$;

create or replace function private.catalogize_shared_ingredients(
  target_household uuid,
  source_ingredients jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ingredient jsonb;
  catalog_id uuid;
  normalized jsonb := '[]'::jsonb;
begin
  for ingredient in
    select value from jsonb_array_elements(
      coalesce(source_ingredients, '[]'::jsonb)
    )
  loop
    insert into public.ingredient_catalog(
      household_id,
      canonical_name,
      display_name,
      default_unit,
      dimension,
      aisle,
      aliases,
      usage_count,
      last_used_at
    )
    values (
      target_household,
      ingredient->>'canonicalName',
      ingredient->>'name',
      coalesce(ingredient->>'unit', 'count'),
      coalesce(
        (ingredient->>'dimension')::public.unit_dimension,
        'count'
      ),
      coalesce(
        (ingredient->>'aisle')::public.grocery_aisle,
        'Other'
      ),
      array[ingredient->>'name'],
      1,
      now()
    )
    on conflict (household_id, canonical_name)
    do update set
      usage_count = public.ingredient_catalog.usage_count + 1,
      last_used_at = now()
    returning id into catalog_id;
    normalized := normalized || jsonb_build_array(
      (ingredient - 'catalogId')
      || jsonb_build_object('catalogId', catalog_id)
    );
  end loop;
  return normalized;
end;
$$;

create or replace function private.copy_recipe_from_share(
  target_share uuid,
  target_revision uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  household uuid := private.current_household_id();
  share public.recipe_shares;
  revision public.recipe_share_revisions;
  snapshot jsonb;
  new_recipe uuid;
begin
  if household is null then
    raise exception 'Household membership required';
  end if;
  select * into share from public.recipe_shares
  where id = target_share for update;
  select * into revision from public.recipe_share_revisions
  where id = target_revision and share_id = share.id;
  if share.id is null or revision.id is null or not share.active then
    raise exception 'Recipe share is unavailable';
  end if;
  snapshot := revision.snapshot;

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
    created_by
  )
  values (
    household,
    snapshot->>'title',
    coalesce(snapshot->>'description', ''),
    nullif(snapshot->>'sourceUrl', ''),
    nullif(snapshot->>'sourceCreator', ''),
    nullif(snapshot->>'imageUrl', ''),
    coalesce((snapshot->>'prepMinutes')::integer, 0),
    coalesce((snapshot->>'cookMinutes')::integer, 0),
    coalesce(
      array(select jsonb_array_elements_text(snapshot->'tags')),
      '{}'::text[]
    ),
    false,
    'private',
    auth.uid()
  )
  returning id into new_recipe;

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
    new_recipe,
    1,
    coalesce((snapshot->>'yield')::numeric, 4),
    private.catalogize_shared_ingredients(
      household,
      snapshot->'ingredients'
    ),
    coalesce(snapshot->'instructions', '[]'::jsonb),
    'Copied from ' || coalesce(snapshot->>'attributionHousehold', 'community'),
    auth.uid()
  );

  insert into public.recipe_copy_origins(
    recipe_id,
    source_recipe_id,
    share_id,
    last_applied_revision_id,
    updates_enabled
  )
  values (
    new_recipe,
    share.source_recipe_id,
    share.id,
    revision.id,
    true
  );
  return new_recipe;
end;
$$;

create or replace function public.accept_private_recipe_share(
  share_token uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  share public.recipe_shares;
  current_email citext;
  revision_id uuid;
  copied_recipe uuid;
begin
  select lower(email)::citext into current_email
  from auth.users where id = auth.uid();
  select * into share from public.recipe_shares
  where token = share_token and kind = 'private'
  for update;
  if share.id is null
    or not share.active
    or share.accepted_at is not null
    or share.expires_at <= now()
    or lower(share.recipient_email)::citext <> current_email
  then
    raise exception 'Recipe invitation is invalid, expired, or belongs to another email';
  end if;
  select id into revision_id from public.recipe_share_revisions
  where share_id = share.id order by source_version desc limit 1;
  copied_recipe := private.copy_recipe_from_share(share.id, revision_id);
  update public.recipe_shares
  set
    accepted_at = now(),
    recipient_household_id = private.current_household_id()
  where id = share.id;
  return copied_recipe;
end;
$$;

create or replace function public.copy_public_recipe(target_recipe uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_share_id uuid;
  selected_revision_id uuid;
begin
  select id into selected_share_id from public.recipe_shares
  where source_recipe_id = target_recipe
    and kind = 'public'
    and active = true;
  if selected_share_id is null then
    raise exception 'Public recipe not found';
  end if;
  select id into selected_revision_id from public.recipe_share_revisions
  where share_id = selected_share_id
  order by source_version desc limit 1;
  return private.copy_recipe_from_share(
    selected_share_id,
    selected_revision_id
  );
end;
$$;

create or replace function public.apply_recipe_share_revision(
  target_origin uuid,
  target_revision uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  origin public.recipe_copy_origins;
  recipe public.recipes;
  revision public.recipe_share_revisions;
  snapshot jsonb;
  next_version integer;
begin
  select * into origin from public.recipe_copy_origins
  where id = target_origin for update;
  select * into recipe from public.recipes
  where id = origin.recipe_id for update;
  select * into revision from public.recipe_share_revisions
  where id = target_revision and share_id = origin.share_id;
  if origin.id is null
    or recipe.id is null
    or revision.id is null
    or not origin.updates_enabled
    or not private.is_household_member(recipe.household_id)
  then
    raise exception 'Recipe update is unavailable';
  end if;
  snapshot := revision.snapshot;
  next_version := recipe.current_version + 1;

  update public.recipes set
    title = snapshot->>'title',
    description = coalesce(snapshot->>'description', ''),
    source_url = nullif(snapshot->>'sourceUrl', ''),
    source_creator = nullif(snapshot->>'sourceCreator', ''),
    image_path = nullif(snapshot->>'imageUrl', ''),
    prep_minutes = coalesce((snapshot->>'prepMinutes')::integer, 0),
    cook_minutes = coalesce((snapshot->>'cookMinutes')::integer, 0),
    tags = coalesce(
      array(select jsonb_array_elements_text(snapshot->'tags')),
      '{}'::text[]
    ),
    current_version = next_version
  where id = recipe.id;

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
    recipe.id,
    next_version,
    coalesce((snapshot->>'yield')::numeric, 4),
    private.catalogize_shared_ingredients(
      recipe.household_id,
      snapshot->'ingredients'
    ),
    coalesce(snapshot->'instructions', '[]'::jsonb),
    'Applied shared recipe update',
    auth.uid()
  );

  update public.recipe_copy_origins
  set last_applied_revision_id = revision.id
  where id = origin.id;
  return next_version;
end;
$$;

create or replace function public.restore_recipe_version(
  target_recipe uuid,
  target_version integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  recipe public.recipes;
  restored public.recipe_versions;
  next_version integer;
begin
  select * into recipe from public.recipes
  where id = target_recipe for update;
  if recipe.id is null
    or not private.is_household_member(recipe.household_id)
  then
    raise exception 'Recipe not found';
  end if;
  select * into restored from public.recipe_versions
  where recipe_id = recipe.id and version = target_version;
  if restored.id is null then raise exception 'Recipe version not found'; end if;
  next_version := recipe.current_version + 1;
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
    recipe.id,
    next_version,
    restored.yield_count,
    restored.ingredients,
    restored.instructions,
    'Restored from version ' || target_version,
    auth.uid()
  );
  update public.recipes set current_version = next_version
  where id = recipe.id;
  return next_version;
end;
$$;

create or replace function public.revoke_recipe_share(target_share uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  share public.recipe_shares;
begin
  select * into share from public.recipe_shares
  where id = target_share for update;
  if share.id is null
    or not private.is_household_member(share.source_household_id)
  then
    raise exception 'Recipe share not found';
  end if;
  update public.recipe_shares set active = false where id = share.id;
end;
$$;

create or replace function public.get_public_recipe_library()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    private.recipe_snapshot(recipes.id, recipes.current_version)
    || jsonb_build_object(
      'id', recipes.id,
      'currentVersion', recipes.current_version,
      'createdAt', recipes.created_at
    )
    order by recipes.published_at desc
  ), '[]'::jsonb)
  from public.recipes recipes
  join public.recipe_shares shares
    on shares.source_recipe_id = recipes.id
   and shares.kind = 'public'
   and shares.active = true
  where recipes.visibility = 'public'
    and auth.uid() is not null
    and recipes.household_id <> private.current_household_id();
$$;

create or replace function private.capture_recipe_share_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  share_row public.recipe_shares;
begin
  for share_row in
    select * from public.recipe_shares
    where source_recipe_id = new.recipe_id and active = true
  loop
    insert into public.recipe_share_revisions(
      share_id,
      source_recipe_id,
      source_version,
      snapshot
    )
    values (
      share_row.id,
      new.recipe_id,
      new.version,
      private.recipe_snapshot(new.recipe_id, new.version)
    )
    on conflict (share_id, source_version) do nothing;
  end loop;
  update public.recipes
  set published_version = new.version
  where id = new.recipe_id and visibility = 'public';
  return new;
end;
$$;

drop trigger if exists recipe_versions_capture_shares
on public.recipe_versions;
create trigger recipe_versions_capture_shares
after insert on public.recipe_versions
for each row execute function private.capture_recipe_share_revision();

revoke execute on function private.recipe_snapshot(uuid, integer)
  from public, anon, authenticated;
revoke execute on function private.catalogize_shared_ingredients(uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function private.copy_recipe_from_share(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.capture_recipe_share_revision()
  from public, anon, authenticated;

revoke execute on function public.set_recipe_visibility(uuid, text)
  from public, anon;
revoke execute on function public.create_private_recipe_share(uuid, text)
  from public, anon;
revoke execute on function public.accept_private_recipe_share(uuid)
  from public, anon;
revoke execute on function public.copy_public_recipe(uuid)
  from public, anon;
revoke execute on function public.apply_recipe_share_revision(uuid, uuid)
  from public, anon;
revoke execute on function public.get_public_recipe_library()
  from public, anon;
revoke execute on function public.restore_recipe_version(uuid, integer)
  from public, anon;
revoke execute on function public.revoke_recipe_share(uuid)
  from public, anon;

grant execute on function public.set_recipe_visibility(uuid, text) to authenticated;
grant execute on function public.create_private_recipe_share(uuid, text) to authenticated;
grant execute on function public.accept_private_recipe_share(uuid) to authenticated;
grant execute on function public.copy_public_recipe(uuid) to authenticated;
grant execute on function public.apply_recipe_share_revision(uuid, uuid) to authenticated;
grant execute on function public.get_public_recipe_library() to authenticated;
grant execute on function public.restore_recipe_version(uuid, integer) to authenticated;
grant execute on function public.revoke_recipe_share(uuid) to authenticated;
