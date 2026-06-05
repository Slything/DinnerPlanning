grant usage on schema public to authenticated;

grant select, insert, update, delete on table
  public.households,
  public.household_members,
  public.household_invitations,
  public.recipes,
  public.recipe_versions,
  public.recipe_attachments,
  public.weekly_plans,
  public.planned_meals,
  public.cooking_sessions,
  public.ingredient_usages,
  public.recipe_change_proposals,
  public.pantry_items,
  public.pantry_transactions,
  public.pantry_allocations,
  public.shopping_lists,
  public.shopping_list_items,
  public.ingredient_catalog,
  public.recipe_shares,
  public.recipe_share_revisions,
  public.recipe_copy_origins
to authenticated;
