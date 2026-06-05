create or replace function public.upsert_weekly_plan_meal(
  plan_week_start date,
  target_meal_date date,
  meal_kind text,
  target_recipe uuid,
  meal_servings numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  household uuid := private.current_household_id();
  plan_id uuid;
  meal_id uuid;
begin
  if household is null then raise exception 'Household membership required'; end if;
  if meal_kind not in ('recipe', 'leftovers', 'dining-out') then
    raise exception 'Invalid meal type';
  end if;
  if meal_servings <= 0 then raise exception 'Servings must be positive'; end if;
  if meal_kind = 'recipe' then
    if target_recipe is null or not exists (
      select 1 from public.recipes
      where id = target_recipe and household_id = household
    ) then
      raise exception 'Household recipe not found';
    end if;
  else
    target_recipe := null;
  end if;

  insert into public.weekly_plans(household_id, week_start)
  values (household, plan_week_start)
  on conflict (household_id, week_start)
  do update set updated_at = now()
  returning id into plan_id;

  insert into public.planned_meals(
    household_id,
    weekly_plan_id,
    meal_date,
    kind,
    recipe_id,
    servings
  )
  values (
    household,
    plan_id,
    target_meal_date,
    meal_kind,
    target_recipe,
    meal_servings
  )
  on conflict (weekly_plan_id, meal_date)
  do update set
    kind = excluded.kind,
    recipe_id = excluded.recipe_id,
    servings = excluded.servings,
    cooked_at = null,
    updated_at = now()
  returning id into meal_id;

  update public.shopping_lists
  set stale = true
  where weekly_plan_id = plan_id and completed_at is null;
  return meal_id;
end;
$$;

create or replace function public.replace_shopping_list(
  target_weekly_plan uuid,
  generated_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  household uuid := private.current_household_id();
  list_id uuid;
  item jsonb;
begin
  if household is null or not exists (
    select 1 from public.weekly_plans
    where id = target_weekly_plan and household_id = household
  ) then
    raise exception 'Weekly plan not found';
  end if;
  if jsonb_typeof(generated_items) <> 'array' then
    raise exception 'Shopping items must be an array';
  end if;

  select id into list_id
  from public.shopping_lists
  where household_id = household
    and weekly_plan_id = target_weekly_plan
    and completed_at is null
  order by generated_at desc
  limit 1
  for update;

  if list_id is null then
    insert into public.shopping_lists(
      household_id,
      weekly_plan_id,
      stale
    )
    values (household, target_weekly_plan, false)
    returning id into list_id;
  else
    update public.shopping_lists
    set generated_at = now(), stale = false, completed_at = null
    where id = list_id;
    delete from public.shopping_list_items
    where shopping_list_id = list_id;
  end if;

  for item in select value from jsonb_array_elements(generated_items)
  loop
    insert into public.shopping_list_items(
      shopping_list_id,
      household_id,
      name,
      canonical_name,
      quantity,
      unit,
      dimension,
      aisle,
      checked,
      manual,
      qualitative,
      sources
    )
    values (
      list_id,
      household,
      item->>'name',
      item->>'canonicalName',
      nullif(item->>'quantity', '')::numeric,
      coalesce(item->>'unit', 'count'),
      (item->>'dimension')::public.unit_dimension,
      (item->>'aisle')::public.grocery_aisle,
      coalesce((item->>'checked')::boolean, false),
      coalesce((item->>'manual')::boolean, false),
      nullif(item->>'qualitative', ''),
      coalesce(item->'sources', '[]'::jsonb)
    );
  end loop;
  return list_id;
end;
$$;

create or replace function public.complete_shopping_list(
  target_list uuid,
  purchased_item_ids uuid[]
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  household uuid := private.current_household_id();
  list public.shopping_lists;
  item public.shopping_list_items;
  stock public.pantry_items;
  pantry_id uuid;
  purchase_in_stock_unit numeric;
  completed timestamptz := now();
begin
  select * into list from public.shopping_lists
  where id = target_list for update;
  if household is null or list.id is null or list.household_id <> household then
    raise exception 'Shopping list not found';
  end if;
  if list.completed_at is not null then
    raise exception 'Shopping list was already completed';
  end if;

  for item in
    select * from public.shopping_list_items
    where shopping_list_id = list.id
      and id = any(purchased_item_ids)
      and quantity is not null
    for update
  loop
    stock := null;
    select * into stock
    from public.pantry_items
    where household_id = household
      and canonical_name = item.canonical_name
      and dimension = item.dimension
      and (
        item.dimension <> 'package'
        or private.base_unit(unit) = private.base_unit(item.unit)
      )
    limit 1
    for update;

    if stock.id is null then
      insert into public.pantry_items(
        household_id,
        name,
        canonical_name,
        quantity,
        unit,
        dimension,
        aisle,
        needs_confirmation
      )
      values (
        household,
        item.name,
        item.canonical_name,
        item.quantity,
        item.unit,
        item.dimension,
        item.aisle,
        false
      )
      returning id into pantry_id;
      purchase_in_stock_unit := item.quantity;
    else
      pantry_id := stock.id;
      purchase_in_stock_unit :=
        item.quantity
        * private.unit_factor(item.unit)
        / private.unit_factor(stock.unit);
      update public.pantry_items
      set
        quantity = case
          when quantity is null then null
          else quantity + purchase_in_stock_unit
        end,
        needs_confirmation = quantity is null,
        updated_at = completed
      where id = stock.id;
    end if;

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
      pantry_id,
      household,
      'restock',
      purchase_in_stock_unit,
      coalesce(stock.unit, item.unit),
      'Added after shopping',
      auth.uid()
    );
  end loop;

  update public.shopping_lists
  set completed_at = completed
  where id = list.id;
  return completed;
end;
$$;

revoke execute on function public.upsert_weekly_plan_meal(
  date,
  date,
  text,
  uuid,
  numeric
) from public, anon;
revoke execute on function public.replace_shopping_list(uuid, jsonb)
  from public, anon;
revoke execute on function public.complete_shopping_list(uuid, uuid[])
  from public, anon;

grant execute on function public.upsert_weekly_plan_meal(
  date,
  date,
  text,
  uuid,
  numeric
) to authenticated;
grant execute on function public.replace_shopping_list(uuid, jsonb)
  to authenticated;
grant execute on function public.complete_shopping_list(uuid, uuid[])
  to authenticated;
