alter table public.households
  add column if not exists ai_model_id text;

alter table public.household_members
  add column if not exists email citext;

update public.household_members members
set email = users.email::citext
from auth.users users
where users.id = members.user_id
  and members.email is null;

alter table public.recipes
  add column if not exists visibility text not null default 'private'
    check (visibility in ('private', 'public')),
  add column if not exists published_version integer,
  add column if not exists published_at timestamptz;

create table if not exists public.ingredient_catalog (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  canonical_name text not null,
  display_name text not null,
  default_unit text not null default 'count',
  dimension public.unit_dimension not null default 'count',
  aisle public.grocery_aisle not null default 'Other',
  aliases text[] not null default '{}',
  usage_count integer not null default 1,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (household_id, canonical_name)
);

create table if not exists public.recipe_shares (
  id uuid primary key default gen_random_uuid(),
  source_recipe_id uuid not null references public.recipes(id) on delete cascade,
  source_household_id uuid not null references public.households(id) on delete cascade,
  recipient_email citext,
  recipient_household_id uuid references public.households(id) on delete set null,
  token uuid unique default gen_random_uuid(),
  kind text not null check (kind in ('public', 'private')),
  active boolean not null default true,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (
    (kind = 'public' and recipient_email is null)
    or (kind = 'private' and recipient_email is not null)
  )
);

create unique index if not exists recipe_public_share_unique
  on public.recipe_shares(source_recipe_id)
  where kind = 'public';

create table if not exists public.recipe_share_revisions (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.recipe_shares(id) on delete cascade,
  source_recipe_id uuid not null references public.recipes(id) on delete cascade,
  source_version integer not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (share_id, source_version),
  check (jsonb_typeof(snapshot) = 'object')
);

create table if not exists public.recipe_copy_origins (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null unique references public.recipes(id) on delete cascade,
  source_recipe_id uuid not null references public.recipes(id) on delete cascade,
  share_id uuid references public.recipe_shares(id) on delete set null,
  last_applied_revision_id uuid references public.recipe_share_revisions(id),
  updates_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists ingredient_catalog_household_name_idx
  on public.ingredient_catalog(household_id, canonical_name);
create index if not exists recipe_shares_recipient_idx
  on public.recipe_shares(recipient_email, active);
create index if not exists recipe_copy_origins_source_idx
  on public.recipe_copy_origins(source_recipe_id);

create or replace function private.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id
  from public.household_members
  where user_id = auth.uid()
  limit 1;
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
set search_path = public, auth
as $$
declare
  new_household_id uuid;
  member_email citext;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if exists (
    select 1 from public.household_members where user_id = auth.uid()
  ) then
    raise exception 'User already belongs to a household';
  end if;

  select lower(email)::citext into member_email
  from auth.users where id = auth.uid();

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
    email,
    display_name
  )
  values (
    new_household_id,
    auth.uid(),
    member_email,
    member_display_name
  );

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
  from auth.users where id = auth.uid();

  select * into invitation
  from public.household_invitations
  where token = invitation_token
  for update;

  if invitation.id is null
    or invitation.accepted_at is not null
    or invitation.expires_at <= now()
    or lower(invitation.email)::citext <> current_email
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

    normalized_ingredients := normalized_ingredients || jsonb_build_array(
      ingredient || jsonb_build_object('catalogId', catalog_id)
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

alter table public.ingredient_catalog enable row level security;
alter table public.recipe_shares enable row level security;
alter table public.recipe_share_revisions enable row level security;
alter table public.recipe_copy_origins enable row level security;

create policy ingredient_catalog_household_all
on public.ingredient_catalog
for all
using (private.is_household_member(household_id))
with check (private.is_household_member(household_id));

create policy public_recipes_select
on public.recipes
for select
using (
  private.is_household_member(household_id)
  or (visibility = 'public' and auth.uid() is not null)
);

drop policy if exists recipes_select on public.recipes;

create policy recipe_shares_select
on public.recipe_shares
for select
using (
  private.is_household_member(source_household_id)
  or (
    auth.uid() is not null
    and (
      kind = 'public'
      or lower(recipient_email)::citext = lower(auth.jwt()->>'email')::citext
      or private.is_household_member(recipient_household_id)
    )
  )
);

create policy recipe_shares_insert
on public.recipe_shares
for insert
with check (
  private.is_household_member(source_household_id)
  and created_by = auth.uid()
);

create policy recipe_shares_update
on public.recipe_shares
for update
using (private.is_household_member(source_household_id))
with check (private.is_household_member(source_household_id));

create policy share_revisions_select
on public.recipe_share_revisions
for select
using (
  exists (
    select 1
    from public.recipe_shares shares
    where shares.id = recipe_share_revisions.share_id
      and (
        private.is_household_member(shares.source_household_id)
        or (
          shares.active
          and auth.uid() is not null
          and (
            shares.kind = 'public'
            or lower(shares.recipient_email)::citext =
              lower(auth.jwt()->>'email')::citext
            or private.is_household_member(shares.recipient_household_id)
          )
        )
      )
  )
);

create policy share_revisions_insert
on public.recipe_share_revisions
for insert
with check (
  exists (
    select 1 from public.recipes
    where recipes.id = recipe_share_revisions.source_recipe_id
      and private.is_household_member(recipes.household_id)
  )
);

create policy copy_origins_household_all
on public.recipe_copy_origins
for all
using (
  exists (
    select 1 from public.recipes
    where recipes.id = recipe_copy_origins.recipe_id
      and private.is_household_member(recipes.household_id)
  )
)
with check (
  exists (
    select 1 from public.recipes
    where recipes.id = recipe_copy_origins.recipe_id
      and private.is_household_member(recipes.household_id)
  )
);

grant execute on function private.current_household_id() to authenticated;
grant execute on function public.create_recipe_with_catalog(jsonb) to authenticated;
