alter table public.household_members
  add column if not exists avatar_url text;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'household_members'
      and policyname = 'members_update_self'
  ) then
    create policy members_update_self
    on public.household_members
    for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
  end if;
end;
$$;
