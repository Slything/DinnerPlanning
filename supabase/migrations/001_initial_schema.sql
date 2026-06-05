create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists private;

create type public.unit_dimension as enum (
  'count',
  'mass',
  'volume',
  'package',
  'qualitative'
);

create type public.grocery_aisle as enum (
  'Produce',
  'Meat',
  'Dairy',
  'Bakery',
  'Pantry',
  'Frozen',
  'Other'
);

create type public.proposal_status as enum ('pending', 'approved', 'ignored');
create type public.pantry_transaction_kind as enum (
  'manual',
  'cooking',
  'restock',
  'correction'
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  default_servings integer not null default 4 check (default_servings > 0),
  week_starts_on smallint not null default 0 check (week_starts_on in (0, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_color text not null default '#315c4a',
  joined_at timestamptz not null default now(),
  unique (household_id, user_id),
  unique (user_id)
);

create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email citext not null,
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  source_url text,
  source_creator text,
  image_path text,
  prep_minutes integer not null default 0 check (prep_minutes >= 0),
  cook_minutes integer not null default 0 check (cook_minutes >= 0),
  tags text[] not null default '{}',
  favorite boolean not null default false,
  current_version integer not null default 1 check (current_version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  version integer not null check (version > 0),
  yield_count numeric not null default 4 check (yield_count > 0),
  ingredients jsonb not null default '[]'::jsonb,
  instructions jsonb not null default '[]'::jsonb,
  note text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (recipe_id, version),
  check (jsonb_typeof(ingredients) = 'array'),
  check (jsonb_typeof(instructions) = 'array')
);

create table public.recipe_attachments (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  storage_path text not null,
  content_type text not null,
  source_kind text not null check (source_kind in ('screenshot', 'photo', 'import')),
  created_at timestamptz not null default now()
);

create table public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  week_start date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, week_start)
);

create table public.planned_meals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  weekly_plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  meal_date date not null,
  kind text not null check (kind in ('recipe', 'leftovers', 'dining-out')),
  recipe_id uuid references public.recipes(id) on delete set null,
  servings numeric not null default 4 check (servings > 0),
  cooked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (weekly_plan_id, meal_date),
  check (
    (kind = 'recipe' and recipe_id is not null)
    or (kind <> 'recipe' and recipe_id is null)
  )
);

create table public.cooking_sessions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  planned_meal_id uuid references public.planned_meals(id) on delete set null,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  recipe_version integer not null,
  servings numeric not null check (servings > 0),
  cooked_at timestamptz not null default now(),
  cooked_by uuid not null references auth.users(id),
  notes text not null default '',
  adjustments jsonb not null default '[]'::jsonb,
  check (jsonb_typeof(adjustments) = 'array')
);

create table public.ingredient_usages (
  id uuid primary key default gen_random_uuid(),
  cooking_session_id uuid not null references public.cooking_sessions(id) on delete cascade,
  ingredient_id text,
  name text not null,
  canonical_name text not null,
  quantity numeric,
  unit text not null,
  dimension public.unit_dimension not null,
  approximate boolean not null default false
);

create table public.recipe_change_proposals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  cooking_session_id uuid not null references public.cooking_sessions(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  based_on_version integer not null,
  status public.proposal_status not null default 'pending',
  proposed_ingredients jsonb not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  check (jsonb_typeof(proposed_ingredients) = 'array')
);

create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  canonical_name text not null,
  quantity numeric,
  unit text not null,
  dimension public.unit_dimension not null,
  aisle public.grocery_aisle not null default 'Other',
  needs_confirmation boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, canonical_name, unit, dimension)
);

create table public.pantry_transactions (
  id uuid primary key default gen_random_uuid(),
  pantry_item_id uuid not null references public.pantry_items(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  kind public.pantry_transaction_kind not null,
  quantity_delta numeric,
  unit text not null,
  note text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.pantry_allocations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  planned_meal_id uuid not null references public.planned_meals(id) on delete cascade,
  pantry_item_id uuid not null references public.pantry_items(id) on delete cascade,
  quantity numeric,
  unit text not null,
  created_at timestamptz not null default now(),
  unique (planned_meal_id, pantry_item_id)
);

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  weekly_plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stale boolean not null default false,
  completed_at timestamptz
);

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references public.shopping_lists(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  canonical_name text not null,
  quantity numeric,
  unit text not null,
  dimension public.unit_dimension not null,
  aisle public.grocery_aisle not null default 'Other',
  checked boolean not null default false,
  manual boolean not null default false,
  qualitative text,
  sources jsonb not null default '[]'::jsonb,
  client_mutation_id text unique,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(sources) = 'array')
);

create index household_members_household_idx
  on public.household_members(household_id);
create index recipes_household_idx on public.recipes(household_id);
create index planned_meals_household_date_idx
  on public.planned_meals(household_id, meal_date);
create index cooking_sessions_recipe_date_idx
  on public.cooking_sessions(recipe_id, cooked_at desc);
create index pantry_items_household_idx on public.pantry_items(household_id);
create index shopping_lists_household_idx
  on public.shopping_lists(household_id, generated_at desc);

create or replace function private.is_household_member(target_household uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household
      and user_id = auth.uid()
  );
$$;

create or replace function public.create_household(
  household_name text,
  household_default_servings integer default 4,
  household_week_starts_on smallint default 0,
  member_display_name text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if exists (
    select 1 from public.household_members where user_id = auth.uid()
  ) then
    raise exception 'User already belongs to a household';
  end if;

  insert into public.households(name, default_servings, week_starts_on)
  values (
    household_name,
    household_default_servings,
    household_week_starts_on
  )
  returning id into new_household_id;

  insert into public.household_members(
    household_id,
    user_id,
    display_name
  )
  values (new_household_id, auth.uid(), member_display_name);

  return new_household_id;
end;
$$;

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
  from auth.users
  where id = auth.uid();

  select * into invitation
  from public.household_invitations
  where token = invitation_token
  for update;

  if invitation.id is null
    or invitation.accepted_at is not null
    or invitation.expires_at <= now()
    or invitation.email <> current_email
  then
    raise exception 'Invitation is invalid or expired';
  end if;

  insert into public.household_members(household_id, user_id, display_name)
  values (
    invitation.household_id,
    auth.uid(),
    split_part(current_email::text, '@', 1)
  );

  update public.household_invitations
  set accepted_at = now()
  where id = invitation.id;

  return invitation.household_id;
end;
$$;

create or replace function public.review_recipe_change_proposal(
  proposal_id uuid,
  decision public.proposal_status,
  reviewed_ingredients jsonb default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal public.recipe_change_proposals;
  recipe public.recipes;
  previous_version public.recipe_versions;
  next_version integer;
begin
  if decision not in ('approved', 'ignored') then
    raise exception 'Decision must be approved or ignored';
  end if;

  select * into proposal
  from public.recipe_change_proposals
  where id = proposal_id
  for update;

  if proposal.id is null
    or not private.is_household_member(proposal.household_id)
  then
    raise exception 'Proposal not found';
  end if;
  if proposal.status <> 'pending' then
    raise exception 'Proposal was already reviewed';
  end if;

  select * into recipe
  from public.recipes
  where id = proposal.recipe_id
  for update;

  if decision = 'approved' then
    if recipe.current_version <> proposal.based_on_version then
      raise exception 'Recipe changed; re-review against the latest version';
    end if;
    select * into previous_version
    from public.recipe_versions
    where recipe_id = recipe.id
      and version = recipe.current_version;

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
      previous_version.yield_count,
      coalesce(reviewed_ingredients, proposal.proposed_ingredients),
      previous_version.instructions,
      proposal.note,
      auth.uid()
    );

    update public.recipes
    set current_version = next_version, updated_at = now()
    where id = recipe.id;
  else
    next_version := recipe.current_version;
  end if;

  update public.recipe_change_proposals
  set
    status = decision,
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    proposed_ingredients = coalesce(
      reviewed_ingredients,
      proposed_ingredients
    )
  where id = proposal.id;

  return next_version;
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
      nullif(usage_row->>'quantity', '')::numeric,
      usage_row->>'unit',
      (usage_row->>'dimension')::public.unit_dimension,
      coalesce((usage_row->>'approximate')::boolean, false)
    );

    select * into stock
    from public.pantry_items
    where household_id = meal.household_id
      and canonical_name = usage_row->>'canonicalName'
      and dimension = (usage_row->>'dimension')::public.unit_dimension
    limit 1
    for update;

    if stock.id is not null then
      usage_quantity := nullif(usage_row->>'quantity', '')::numeric;
      if usage_quantity is null
        or coalesce((usage_row->>'approximate')::boolean, false)
        or stock.quantity is null
      then
        update public.pantry_items
        set needs_confirmation = true, updated_at = now()
        where id = stock.id;
      else
        update public.pantry_items
        set
          quantity = greatest(quantity - usage_quantity, 0),
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
          -usage_quantity,
          usage_row->>'unit',
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

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger households_touch_updated_at
before update on public.households
for each row execute function public.touch_updated_at();
create trigger recipes_touch_updated_at
before update on public.recipes
for each row execute function public.touch_updated_at();
create trigger weekly_plans_touch_updated_at
before update on public.weekly_plans
for each row execute function public.touch_updated_at();
create trigger planned_meals_touch_updated_at
before update on public.planned_meals
for each row execute function public.touch_updated_at();
create trigger pantry_items_touch_updated_at
before update on public.pantry_items
for each row execute function public.touch_updated_at();
create trigger shopping_lists_touch_updated_at
before update on public.shopping_lists
for each row execute function public.touch_updated_at();
create trigger shopping_list_items_touch_updated_at
before update on public.shopping_list_items
for each row execute function public.touch_updated_at();

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invitations enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_versions enable row level security;
alter table public.recipe_attachments enable row level security;
alter table public.weekly_plans enable row level security;
alter table public.planned_meals enable row level security;
alter table public.cooking_sessions enable row level security;
alter table public.ingredient_usages enable row level security;
alter table public.recipe_change_proposals enable row level security;
alter table public.pantry_items enable row level security;
alter table public.pantry_transactions enable row level security;
alter table public.pantry_allocations enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;

create policy households_select on public.households
for select using (private.is_household_member(id));
create policy households_update on public.households
for update using (private.is_household_member(id))
with check (private.is_household_member(id));

create policy members_select on public.household_members
for select using (private.is_household_member(household_id));

create policy invitations_select on public.household_invitations
for select using (private.is_household_member(household_id));
create policy invitations_insert on public.household_invitations
for insert with check (
  private.is_household_member(household_id)
  and invited_by = auth.uid()
);
create policy invitations_update on public.household_invitations
for update using (private.is_household_member(household_id));
create policy invitations_delete on public.household_invitations
for delete using (private.is_household_member(household_id));

create policy recipes_select on public.recipes
for select using (private.is_household_member(household_id));
create policy recipes_insert on public.recipes
for insert with check (
  private.is_household_member(household_id)
  and created_by = auth.uid()
);
create policy recipes_update on public.recipes
for update using (private.is_household_member(household_id))
with check (private.is_household_member(household_id));
create policy recipes_delete on public.recipes
for delete using (private.is_household_member(household_id));

create policy recipe_versions_all on public.recipe_versions
for all using (
  exists (
    select 1 from public.recipes
    where recipes.id = recipe_versions.recipe_id
      and private.is_household_member(recipes.household_id)
  )
)
with check (
  exists (
    select 1 from public.recipes
    where recipes.id = recipe_versions.recipe_id
      and private.is_household_member(recipes.household_id)
  )
);

create policy recipe_attachments_all on public.recipe_attachments
for all using (
  exists (
    select 1 from public.recipes
    where recipes.id = recipe_attachments.recipe_id
      and private.is_household_member(recipes.household_id)
  )
)
with check (
  exists (
    select 1 from public.recipes
    where recipes.id = recipe_attachments.recipe_id
      and private.is_household_member(recipes.household_id)
  )
);

create policy weekly_plans_all on public.weekly_plans
for all using (private.is_household_member(household_id))
with check (private.is_household_member(household_id));
create policy planned_meals_all on public.planned_meals
for all using (private.is_household_member(household_id))
with check (private.is_household_member(household_id));
create policy cooking_sessions_all on public.cooking_sessions
for all using (private.is_household_member(household_id))
with check (private.is_household_member(household_id));

create policy ingredient_usages_all on public.ingredient_usages
for all using (
  exists (
    select 1 from public.cooking_sessions
    where cooking_sessions.id = ingredient_usages.cooking_session_id
      and private.is_household_member(cooking_sessions.household_id)
  )
)
with check (
  exists (
    select 1 from public.cooking_sessions
    where cooking_sessions.id = ingredient_usages.cooking_session_id
      and private.is_household_member(cooking_sessions.household_id)
  )
);

create policy proposals_all on public.recipe_change_proposals
for all using (private.is_household_member(household_id))
with check (private.is_household_member(household_id));
create policy pantry_items_all on public.pantry_items
for all using (private.is_household_member(household_id))
with check (private.is_household_member(household_id));
create policy pantry_transactions_all on public.pantry_transactions
for all using (private.is_household_member(household_id))
with check (private.is_household_member(household_id));
create policy pantry_allocations_all on public.pantry_allocations
for all using (private.is_household_member(household_id))
with check (private.is_household_member(household_id));
create policy shopping_lists_all on public.shopping_lists
for all using (private.is_household_member(household_id))
with check (private.is_household_member(household_id));
create policy shopping_list_items_all on public.shopping_list_items
for all using (private.is_household_member(household_id))
with check (private.is_household_member(household_id));

insert into storage.buckets (id, name, public)
values ('recipe-attachments', 'recipe-attachments', false)
on conflict (id) do nothing;

create policy recipe_attachment_storage_select
on storage.objects for select
using (
  bucket_id = 'recipe-attachments'
  and private.is_household_member(((storage.foldername(name))[1])::uuid)
);

create policy recipe_attachment_storage_insert
on storage.objects for insert
with check (
  bucket_id = 'recipe-attachments'
  and private.is_household_member(((storage.foldername(name))[1])::uuid)
);

create policy recipe_attachment_storage_update
on storage.objects for update
using (
  bucket_id = 'recipe-attachments'
  and private.is_household_member(((storage.foldername(name))[1])::uuid)
);

create policy recipe_attachment_storage_delete
on storage.objects for delete
using (
  bucket_id = 'recipe-attachments'
  and private.is_household_member(((storage.foldername(name))[1])::uuid)
);

alter publication supabase_realtime add table public.planned_meals;
alter publication supabase_realtime add table public.pantry_items;
alter publication supabase_realtime add table public.shopping_lists;
alter publication supabase_realtime add table public.shopping_list_items;

grant usage on schema private to authenticated;
grant execute on function private.is_household_member(uuid) to authenticated;
grant execute on function public.create_household(text, integer, smallint, text) to authenticated;
grant execute on function public.accept_household_invitation(uuid) to authenticated;
grant execute on function public.review_recipe_change_proposal(uuid, public.proposal_status, jsonb) to authenticated;
grant execute on function public.record_cooking_session(uuid, text, jsonb, jsonb, jsonb) to authenticated;
