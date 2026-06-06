update public.recipes
set image_path = null
where image_path = 'https://images.unsplash.com/photo-1543353071-873f17a7a088?auto=format&fit=crop&w=900&q=80';

create or replace function public.create_recipe_with_catalog(
  recipe_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  household uuid := private.current_household_id();
  recipe_id uuid;
  ingredient jsonb;
  catalog_id uuid;
  should_save_catalog boolean;
  normalized_ingredients jsonb := '[]'::jsonb;
begin
  if household is null then
    raise exception 'Household membership required';
  end if;

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
    recipe_payload->>'title',
    coalesce(recipe_payload->>'description', ''),
    nullif(recipe_payload->>'sourceUrl', ''),
    nullif(recipe_payload->>'sourceCreator', ''),
    nullif(recipe_payload->>'imageUrl', ''),
    coalesce((recipe_payload->>'prepMinutes')::integer, 0),
    coalesce((recipe_payload->>'cookMinutes')::integer, 0),
    coalesce(
      array(select jsonb_array_elements_text(recipe_payload->'tags')),
      '{}'::text[]
    ),
    coalesce((recipe_payload->>'favorite')::boolean, false),
    coalesce(recipe_payload->>'visibility', 'private'),
    auth.uid()
  )
  returning id into recipe_id;

  for ingredient in
    select value
    from jsonb_array_elements(recipe_payload->'ingredients')
  loop
    catalog_id := null;
    should_save_catalog := case
      when ingredient ? 'saveToCatalog'
        then coalesce((ingredient->>'saveToCatalog')::boolean, true)
      else true
    end;

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
        household,
        ingredient->>'canonicalName',
        ingredient->>'name',
        ingredient->>'unit',
        (ingredient->>'dimension')::public.unit_dimension,
        (ingredient->>'aisle')::public.grocery_aisle,
        array[ingredient->>'name'],
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

    normalized_ingredients := normalized_ingredients || jsonb_build_array(
      case
        when catalog_id is null then ingredient
        else ingredient || jsonb_build_object('catalogId', catalog_id)
      end
    );
  end loop;

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
    recipe_id,
    1,
    coalesce((recipe_payload->>'yield')::numeric, 4),
    normalized_ingredients,
    coalesce(recipe_payload->'instructions', '[]'::jsonb),
    'Original household recipe',
    auth.uid()
  );

  return recipe_id;
end;
$$;

grant execute on function public.create_recipe_with_catalog(jsonb)
  to authenticated;
