create or replace function private.fixed_recipe_tags(source_tags jsonb)
returns text[]
language sql
immutable
as $$
  select case
    when exists (
      select 1
      from jsonb_array_elements_text(coalesce(source_tags, '[]'::jsonb)) tag
      where lower(trim(tag)) = 'quick cook'
    )
      then array['Quick Cook']
    else '{}'::text[]
  end;
$$;

create or replace function private.catalogize_household_recipe_ingredients(
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
  ingredient_aliases text[];
  should_save_catalog boolean;
  normalized jsonb := '[]'::jsonb;
begin
  for ingredient in
    select value from jsonb_array_elements(
      coalesce(source_ingredients, '[]'::jsonb)
    )
  loop
    catalog_id := null;
    should_save_catalog := case
      when ingredient ? 'saveToCatalog'
        then coalesce((ingredient->>'saveToCatalog')::boolean, true)
      else true
    end;

    select array_agg(distinct alias_value)
    into ingredient_aliases
    from (
      select nullif(btrim(ingredient->>'name'), '') as alias_value
      union all
      select nullif(btrim(value), '') as alias_value
      from jsonb_array_elements_text(
        coalesce(ingredient->'aliases', '[]'::jsonb)
      )
    ) aliases
    where alias_value is not null;

    if should_save_catalog then
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
        coalesce(ingredient_aliases, array[ingredient->>'name']),
        1,
        now()
      )
      on conflict (household_id, canonical_name)
      do update set
        display_name = excluded.display_name,
        default_unit = excluded.default_unit,
        dimension = excluded.dimension,
        aisle = excluded.aisle,
        aliases = (
          select array_agg(distinct alias_value)
          from unnest(
            public.ingredient_catalog.aliases || excluded.aliases
          ) alias_value
        ),
        usage_count = public.ingredient_catalog.usage_count + 1,
        last_used_at = now()
      returning id into catalog_id;
    end if;

    normalized := normalized || jsonb_build_array(
      case
        when catalog_id is null then ingredient
        else ingredient || jsonb_build_object('catalogId', catalog_id)
      end
    );
  end loop;

  return normalized;
end;
$$;

create or replace function public.update_recipe_with_catalog(
  target_recipe uuid,
  recipe_payload jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  household uuid := private.current_household_id();
  recipe public.recipes;
  next_version integer;
  normalized_ingredients jsonb;
begin
  select * into recipe
  from public.recipes
  where id = target_recipe
  for update;

  if household is null
    or recipe.id is null
    or recipe.household_id <> household
  then
    raise exception 'Recipe not found';
  end if;

  normalized_ingredients :=
    private.catalogize_household_recipe_ingredients(
      household,
      recipe_payload->'ingredients'
    );
  next_version := recipe.current_version + 1;

  update public.recipes
  set
    title = recipe_payload->>'title',
    description = coalesce(recipe_payload->>'description', ''),
    source_url = nullif(recipe_payload->>'sourceUrl', ''),
    source_creator = nullif(
      coalesce(recipe_payload->>'sourceCreator', recipe.source_creator),
      ''
    ),
    image_path = coalesce(
      nullif(recipe_payload->>'imageUrl', ''),
      recipe.image_path
    ),
    prep_minutes = coalesce((recipe_payload->>'prepMinutes')::integer, 0),
    cook_minutes = coalesce((recipe_payload->>'cookMinutes')::integer, 0),
    tags = private.fixed_recipe_tags(recipe_payload->'tags'),
    current_version = next_version,
    updated_at = now()
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
    coalesce((recipe_payload->>'yield')::numeric, 4),
    normalized_ingredients,
    coalesce(recipe_payload->'instructions', '[]'::jsonb),
    'Household recipe edit',
    auth.uid()
  );

  update public.shopping_lists
  set stale = true
  where household_id = household and completed_at is null;

  return next_version;
end;
$$;

create or replace function public.copy_public_recipe(target_recipe uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  household uuid := private.current_household_id();
  selected_share_id uuid;
  selected_revision_id uuid;
begin
  if household is null then
    raise exception 'Household membership required';
  end if;

  select shares.id into selected_share_id
  from public.recipe_shares shares
  join public.recipes recipes
    on recipes.id = shares.source_recipe_id
  where shares.source_recipe_id = target_recipe
    and shares.kind = 'public'
    and shares.active = true
    and recipes.visibility = 'public'
    and recipes.household_id <> household
  limit 1;

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

revoke execute on function private.fixed_recipe_tags(jsonb)
  from public, anon, authenticated;
revoke execute on function private.catalogize_household_recipe_ingredients(uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.update_recipe_with_catalog(uuid, jsonb)
  from public, anon;
revoke execute on function public.copy_public_recipe(uuid)
  from public, anon;

grant execute on function public.update_recipe_with_catalog(uuid, jsonb)
  to authenticated;
grant execute on function public.copy_public_recipe(uuid)
  to authenticated;
