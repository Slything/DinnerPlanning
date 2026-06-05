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
    when 'packages' then 'package'
    else lower(trim(coalesce(unit_name, 'count')))
  end;
$$;

create or replace function public.record_cooking_session(
  target_meal_id uuid,
  session_notes text,
  session_adjustments jsonb,
  session_usages jsonb,
  proposed_ingredients jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  meal public.planned_meals;
  recipe public.recipes;
  session_id uuid;
  usage_row jsonb;
  stock public.pantry_items;
  usage_quantity numeric;
  stock_quantity_used numeric;
  usage_dimension public.unit_dimension;
  usage_unit text;
begin
  select * into meal
  from public.planned_meals
  where id = target_meal_id
  for update;

  if meal.id is null
    or not private.is_household_member(meal.household_id)
    or meal.recipe_id is null
  then
    raise exception 'Planned recipe meal not found';
  end if;
  if meal.cooked_at is not null then
    raise exception 'This meal was already marked cooked';
  end if;

  select * into recipe from public.recipes where id = meal.recipe_id;

  insert into public.cooking_sessions(
    household_id,
    planned_meal_id,
    recipe_id,
    recipe_version,
    servings,
    cooked_by,
    notes,
    adjustments
  )
  values (
    meal.household_id,
    meal.id,
    recipe.id,
    recipe.current_version,
    meal.servings,
    auth.uid(),
    coalesce(session_notes, ''),
    coalesce(session_adjustments, '[]'::jsonb)
  )
  returning id into session_id;

  for usage_row in
    select value from jsonb_array_elements(session_usages)
  loop
    usage_quantity := nullif(usage_row->>'quantity', '')::numeric;
    usage_dimension :=
      (usage_row->>'dimension')::public.unit_dimension;
    usage_unit := usage_row->>'unit';

    insert into public.ingredient_usages(
      cooking_session_id,
      ingredient_id,
      name,
      canonical_name,
      quantity,
      unit,
      dimension,
      approximate
    )
    values (
      session_id,
      usage_row->>'ingredientId',
      usage_row->>'name',
      usage_row->>'canonicalName',
      usage_quantity,
      usage_unit,
      usage_dimension,
      coalesce((usage_row->>'approximate')::boolean, false)
    );

    select * into stock
    from public.pantry_items
    where household_id = meal.household_id
      and canonical_name = usage_row->>'canonicalName'
      and dimension = usage_dimension
      and (
        usage_dimension <> 'package'
        or private.base_unit(unit) = private.base_unit(usage_unit)
      )
    limit 1
    for update;

    if stock.id is not null then
      if usage_quantity is null
        or coalesce((usage_row->>'approximate')::boolean, false)
        or stock.quantity is null
      then
        update public.pantry_items
        set needs_confirmation = true, updated_at = now()
        where id = stock.id;
      else
        stock_quantity_used :=
          usage_quantity
          * private.unit_factor(usage_unit)
          / private.unit_factor(stock.unit);
        update public.pantry_items
        set
          quantity = greatest(quantity - stock_quantity_used, 0),
          updated_at = now()
        where id = stock.id;

        insert into public.pantry_transactions(
          pantry_item_id,
          household_id,
          kind,
          quantity_delta,
          unit,
          note,
          created_by
        )
        values (
          stock.id,
          meal.household_id,
          'cooking',
          -stock_quantity_used,
          stock.unit,
          'Used for ' || recipe.title,
          auth.uid()
        );
      end if;
    end if;
  end loop;

  delete from public.pantry_allocations where planned_meal_id = meal.id;
  update public.planned_meals set cooked_at = now(), updated_at = now()
  where id = meal.id;
  update public.shopping_lists
  set stale = true, updated_at = now()
  where weekly_plan_id = meal.weekly_plan_id and completed_at is null;

  if proposed_ingredients is not null then
    insert into public.recipe_change_proposals(
      household_id,
      cooking_session_id,
      recipe_id,
      based_on_version,
      proposed_ingredients,
      note
    )
    values (
      meal.household_id,
      session_id,
      recipe.id,
      recipe.current_version,
      proposed_ingredients,
      coalesce(session_notes, '')
    );
  end if;

  return session_id;
end;
$$;

revoke execute on function private.unit_factor(text)
  from public, anon, authenticated;
revoke execute on function private.base_unit(text)
  from public, anon, authenticated;
revoke execute on function public.record_cooking_session(
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb
) from public, anon;
grant execute on function public.record_cooking_session(
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb
) to authenticated;
