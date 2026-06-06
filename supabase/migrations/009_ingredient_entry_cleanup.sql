create or replace function private.unit_factor(unit_name text)
returns numeric
language sql
immutable
as $$
  select case lower(trim(coalesce(unit_name, '')))
    when '' then 1
    when 'count' then 1
    when 'each' then 1
    when 'item' then 1
    when 'items' then 1
    when 'onion' then 1
    when 'onions' then 1
    when 'clove' then 1
    when 'cloves' then 1
    when 'cup' then 236.588
    when 'cups' then 236.588
    when 'c' then 236.588
    when 'tbsp' then 14.7868
    when 'tablespoon' then 14.7868
    when 'tablespoons' then 14.7868
    when 'tsp' then 4.92892
    when 'teaspoon' then 4.92892
    when 'teaspoons' then 4.92892
    when 'ml' then 1
    when 'l' then 1000
    when 'liter' then 1000
    when 'liters' then 1000
    when 'oz' then 28.3495
    when 'ounce' then 28.3495
    when 'ounces' then 28.3495
    when 'lb' then 453.592
    when 'lbs' then 453.592
    when 'pound' then 453.592
    when 'pounds' then 453.592
    when 'g' then 1
    when 'gram' then 1
    when 'grams' then 1
    when 'kg' then 1000
    else 1
  end;
$$;

create or replace function private.base_unit(unit_name text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(unit_name, '')))
    when '' then 'count'
    when 'each' then 'count'
    when 'item' then 'count'
    when 'items' then 'count'
    when 'onion' then 'count'
    when 'onions' then 'count'
    when 'clove' then 'count'
    when 'cloves' then 'count'
    when 'cup' then 'ml'
    when 'cups' then 'ml'
    when 'c' then 'ml'
    when 'tbsp' then 'ml'
    when 'tablespoon' then 'ml'
    when 'tablespoons' then 'ml'
    when 'tsp' then 'ml'
    when 'teaspoon' then 'ml'
    when 'teaspoons' then 'ml'
    when 'l' then 'ml'
    when 'liter' then 'ml'
    when 'liters' then 'ml'
    when 'oz' then 'g'
    when 'ounce' then 'g'
    when 'ounces' then 'g'
    when 'lb' then 'g'
    when 'lbs' then 'g'
    when 'pound' then 'g'
    when 'pounds' then 'g'
    when 'gram' then 'g'
    when 'grams' then 'g'
    when 'kg' then 'g'
    when 'cans' then 'can'
    when 'boxes' then 'box'
    when 'bags' then 'bag'
    when 'bottles' then 'bottle'
    when 'cartons' then 'carton'
    when 'containers' then 'container'
    when 'loaves' then 'loaf'
    when 'sticks' then 'stick'
    when 'slices' then 'slice'
    when 'packets' then 'packet'
    when 'packages' then 'package'
    when 'bunches' then 'bunch'
    when 'jars' then 'jar'
    else lower(trim(coalesce(unit_name, 'count')))
  end;
$$;

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
  ingredient_aliases text[];
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
        household,
        ingredient->>'canonicalName',
        ingredient->>'name',
        ingredient->>'unit',
        (ingredient->>'dimension')::public.unit_dimension,
        (ingredient->>'aisle')::public.grocery_aisle,
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
