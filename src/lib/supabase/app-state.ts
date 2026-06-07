import { format, startOfWeek } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppState,
  CookingSession,
  GroceryAisle,
  HouseholdMember,
  IngredientAmount,
  IngredientCatalogEntry,
  IngredientUsage,
  PantryAllocation,
  PantryItem,
  PantryTransaction,
  PlannedMeal,
  Recipe,
  RecipeChangeProposal,
  RecipeCopyOrigin,
  RecipeVersion,
  ShoppingList,
  ShoppingListItem
} from "@/lib/domain/types";
import type { AuthenticatedUser } from "@/lib/supabase/server";

type Row = Record<string, unknown>;

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalText(value: unknown): string | undefined {
  const valueText = text(value);
  return valueText || undefined;
}

function mapVersion(row: Row): RecipeVersion {
  return {
    id: text(row.id),
    recipeId: text(row.recipe_id),
    version: numberValue(row.version, 1),
    createdAt: text(row.created_at),
    createdBy: text(row.created_by),
    note: text(row.note),
    yield: numberValue(row.yield_count, 4),
    ingredients: rows(row.ingredients) as unknown as IngredientAmount[],
    instructions: Array.isArray(row.instructions)
      ? (row.instructions as string[])
      : []
  };
}

function mapRecipe(row: Row, allVersions: Row[]): Recipe {
  const versions = allVersions
    .filter((version) => version.recipe_id === row.id)
    .map(mapVersion)
    .sort((left, right) => left.version - right.version);
  return {
    id: text(row.id),
    householdId: text(row.household_id),
    title: text(row.title),
    description: text(row.description),
    sourceUrl: optionalText(row.source_url),
    sourceCreator: optionalText(row.source_creator),
    imageUrl: optionalText(row.image_path),
    prepMinutes: numberValue(row.prep_minutes),
    cookMinutes: numberValue(row.cook_minutes),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    favorite: Boolean(row.favorite),
    visibility: row.visibility === "public" ? "public" : "private",
    publishedVersion: row.published_version
      ? numberValue(row.published_version)
      : undefined,
    sourceType: row.visibility === "public" ? "public-owned" : "household",
    sourceLabel: row.visibility === "public" ? "Public" : undefined,
    currentVersion: numberValue(row.current_version, 1),
    versions,
    createdAt: text(row.created_at)
  };
}

function mapMeal(row: Row): PlannedMeal {
  return {
    id: text(row.id),
    householdId: text(row.household_id),
    date: text(row.meal_date),
    kind:
      row.kind === "leftovers" || row.kind === "dining-out"
        ? row.kind
        : "recipe",
    recipeId: optionalText(row.recipe_id),
    servings: numberValue(row.servings, 4),
    cookedAt: optionalText(row.cooked_at)
  };
}

function mapPantry(row: Row): PantryItem {
  return {
    id: text(row.id),
    householdId: text(row.household_id),
    name: text(row.name),
    canonicalName: text(row.canonical_name),
    quantity: row.quantity === null ? null : numberValue(row.quantity),
    unit: text(row.unit, "count"),
    dimension: row.dimension as PantryItem["dimension"],
    aisle: row.aisle as GroceryAisle,
    needsConfirmation: Boolean(row.needs_confirmation),
    updatedAt: text(row.updated_at)
  };
}

export async function loadAppState(
  supabase: SupabaseClient,
  user: AuthenticatedUser
): Promise<AppState | null> {
  const { data: membershipData, error: membershipError } = await supabase
    .from("household_members")
    .select(
      "household_id,households(id,name,default_servings,week_starts_on,ai_model_id)"
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membershipData) return null;

  const membership = membershipData as unknown as Row;
  const householdRelation = Array.isArray(membership.households)
    ? membership.households[0]
    : membership.households;
  const householdRow = householdRelation as Row;
  const householdId = text(membership.household_id);
  const weekStartsOn = numberValue(householdRow.week_starts_on) === 1 ? 1 : 0;
  const weekStart = format(
    startOfWeek(new Date(), { weekStartsOn }),
    "yyyy-MM-dd"
  );

  const planResult = await supabase
    .from("weekly_plans")
    .select("*")
    .eq("household_id", householdId)
    .eq("week_start", weekStart)
    .maybeSingle();
  let planData = planResult.data;
  const planError = planResult.error;
  if (planError) throw planError;
  if (!planData) {
    const created = await supabase
      .from("weekly_plans")
      .insert({ household_id: householdId, week_start: weekStart })
      .select("*")
      .single();
    if (created.error) throw created.error;
    planData = created.data;
  }
  const plan = planData as unknown as Row;

  const [
    membersResult,
    recipesResult,
    versionsResult,
    mealsResult,
    pantryResult,
    transactionsResult,
    allocationsResult,
    listsResult,
    sessionsResult,
    usagesResult,
    proposalsResult,
    catalogResult,
    originsResult,
    shareRevisionsResult
  ] = await Promise.all([
    supabase
      .from("household_members")
      .select("*")
      .eq("household_id", householdId)
      .order("joined_at"),
    supabase
      .from("recipes")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false }),
    supabase.from("recipe_versions").select("*").order("version"),
    supabase
      .from("planned_meals")
      .select("*")
      .eq("weekly_plan_id", text(plan.id))
      .order("meal_date"),
    supabase
      .from("pantry_items")
      .select("*")
      .eq("household_id", householdId)
      .order("name"),
    supabase
      .from("pantry_transactions")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false }),
    supabase
      .from("pantry_allocations")
      .select("*")
      .eq("household_id", householdId),
    supabase
      .from("shopping_lists")
      .select("*")
      .eq("household_id", householdId)
      .is("completed_at", null)
      .order("generated_at", { ascending: false })
      .limit(1),
    supabase
      .from("cooking_sessions")
      .select("*")
      .eq("household_id", householdId)
      .order("cooked_at", { ascending: false }),
    supabase.from("ingredient_usages").select("*"),
    supabase
      .from("recipe_change_proposals")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false }),
    supabase
      .from("ingredient_catalog")
      .select("*")
      .eq("household_id", householdId)
      .order("usage_count", { ascending: false }),
    supabase.from("recipe_copy_origins").select("*"),
    supabase
      .from("recipe_share_revisions")
      .select("id,share_id,source_version,snapshot,created_at")
  ]);

  const firstError = [
    membersResult.error,
    recipesResult.error,
    versionsResult.error,
    mealsResult.error,
    pantryResult.error,
    transactionsResult.error,
    allocationsResult.error,
    listsResult.error,
    sessionsResult.error,
    usagesResult.error,
    proposalsResult.error,
    catalogResult.error,
    originsResult.error,
    shareRevisionsResult.error
  ].find(Boolean);
  if (firstError) throw firstError;

  const recipeRows = rows(recipesResult.data);
  const versionRows = rows(versionsResult.data);
  const originRows = rows(originsResult.data);
  const shareRevisionRows = rows(shareRevisionsResult.data);
  const recipes = recipeRows.map((recipe) => mapRecipe(recipe, versionRows));
  for (const origin of originRows) {
    const recipe = recipes.find((candidate) => candidate.id === origin.recipe_id);
    if (!recipe) continue;
    const revisions = shareRevisionRows
      .filter((revision) => revision.share_id === origin.share_id)
      .sort(
        (left, right) =>
          numberValue(right.source_version) - numberValue(left.source_version)
      );
    const applied = revisions.find(
      (revision) => revision.id === origin.last_applied_revision_id
    );
    const latest = revisions[0];
    const snapshot = latest?.snapshot as Row | undefined;
    recipe.attributionHousehold = optionalText(
      snapshot?.attributionHousehold
    );
    recipe.sourceType = "saved-copy";
    recipe.sourceLabel = `Saved from ${
      recipe.attributionHousehold ?? "another household"
    }`;
    recipe.updateAvailable =
      Boolean(origin.updates_enabled) &&
      Boolean(latest) &&
      numberValue(latest.source_version) >
        numberValue(applied?.source_version);
  }
  const sessionRows = rows(sessionsResult.data);
  const usageRows = rows(usagesResult.data);
  const listRow = rows(listsResult.data)[0];
  let shoppingList: ShoppingList | null = null;
  if (listRow) {
    const { data: itemData, error: itemError } = await supabase
      .from("shopping_list_items")
      .select("*")
      .eq("shopping_list_id", text(listRow.id))
      .order("name");
    if (itemError) throw itemError;
    shoppingList = {
      id: text(listRow.id),
      householdId,
      weeklyPlanId: text(listRow.weekly_plan_id),
      generatedAt: text(listRow.generated_at),
      updatedAt: text(listRow.updated_at),
      stale: Boolean(listRow.stale),
      completedAt: optionalText(listRow.completed_at),
      items: rows(itemData).map(
        (item): ShoppingListItem => ({
          id: text(item.id),
          shoppingListId: text(item.shopping_list_id),
          name: text(item.name),
          canonicalName: text(item.canonical_name),
          quantity:
            item.quantity === null ? null : numberValue(item.quantity),
          unit: text(item.unit, "count"),
          dimension: item.dimension as ShoppingListItem["dimension"],
          aisle: item.aisle as GroceryAisle,
          checked: Boolean(item.checked),
          manual: Boolean(item.manual),
          qualitative: optionalText(
            item.qualitative
          ) as ShoppingListItem["qualitative"],
          sources: Array.isArray(item.sources)
            ? (item.sources as ShoppingListItem["sources"])
            : [],
          updatedAt: text(item.updated_at)
        })
      )
    };
  }

  const members = rows(membersResult.data).map(
    (member): HouseholdMember => ({
      id: text(member.user_id),
      householdId,
      email: text(member.email),
      displayName: text(member.display_name, "Household member"),
      avatarColor: text(member.avatar_color, "#315c4a"),
      avatarUrl: optionalText(member.avatar_url)
    })
  );
  const sessions = sessionRows.map(
    (session): CookingSession => ({
      id: text(session.id),
      householdId,
      plannedMealId: text(session.planned_meal_id),
      recipeId: text(session.recipe_id),
      recipeVersion: numberValue(session.recipe_version, 1),
      servings: numberValue(session.servings, 4),
      cookedAt: text(session.cooked_at),
      cookedBy: text(session.cooked_by),
      notes: text(session.notes),
      adjustments: Array.isArray(session.adjustments)
        ? (session.adjustments as CookingSession["adjustments"])
        : [],
      usage: usageRows
        .filter((usage) => usage.cooking_session_id === session.id)
        .map(
          (usage): IngredientUsage => ({
            id: text(usage.id),
            cookingSessionId: text(usage.cooking_session_id),
            ingredientId: optionalText(usage.ingredient_id),
            name: text(usage.name),
            canonicalName: text(usage.canonical_name),
            quantity:
              usage.quantity === null ? null : numberValue(usage.quantity),
            unit: text(usage.unit, "count"),
            dimension: usage.dimension as IngredientUsage["dimension"],
            approximate: Boolean(usage.approximate)
          })
        )
    })
  );

  return {
    household: {
      id: householdId,
      name: text(householdRow.name),
      defaultServings: numberValue(householdRow.default_servings, 4),
      weekStartsOn,
      aiModelId: optionalText(householdRow.ai_model_id)
    },
    members,
    currentMemberId: user.id,
    recipes,
    ingredientCatalog: rows(catalogResult.data).map(
      (entry): IngredientCatalogEntry => ({
        id: text(entry.id),
        householdId,
        canonicalName: text(entry.canonical_name),
        displayName: text(entry.display_name),
        defaultUnit: text(entry.default_unit, "count"),
        dimension: entry.dimension as IngredientCatalogEntry["dimension"],
        aisle: entry.aisle as GroceryAisle,
        aliases: Array.isArray(entry.aliases)
          ? (entry.aliases as string[])
          : [],
        usageCount: numberValue(entry.usage_count, 1),
        lastUsedAt: text(entry.last_used_at)
      })
    ),
    weeklyPlan: {
      id: text(plan.id),
      householdId,
      weekStart: text(plan.week_start),
      meals: rows(mealsResult.data).map(mapMeal),
      updatedAt: text(plan.updated_at)
    },
    pantry: rows(pantryResult.data).map(mapPantry),
    pantryTransactions: rows(transactionsResult.data).map(
      (transaction): PantryTransaction => ({
        id: text(transaction.id),
        pantryItemId: text(transaction.pantry_item_id),
        householdId,
        kind: transaction.kind as PantryTransaction["kind"],
        quantityDelta:
          transaction.quantity_delta === null
            ? null
            : numberValue(transaction.quantity_delta),
        unit: text(transaction.unit),
        note: text(transaction.note),
        createdAt: text(transaction.created_at),
        createdBy: text(transaction.created_by)
      })
    ),
    allocations: rows(allocationsResult.data).map(
      (allocation): PantryAllocation => ({
        id: text(allocation.id),
        householdId,
        plannedMealId: text(allocation.planned_meal_id),
        pantryItemId: text(allocation.pantry_item_id),
        quantity:
          allocation.quantity === null
            ? null
            : numberValue(allocation.quantity),
        unit: text(allocation.unit),
        createdAt: text(allocation.created_at)
      })
    ),
    shoppingList,
    cookingSessions: sessions,
    proposals: rows(proposalsResult.data).map(
      (proposal): RecipeChangeProposal => ({
        id: text(proposal.id),
        householdId,
        cookingSessionId: text(proposal.cooking_session_id),
        recipeId: text(proposal.recipe_id),
        basedOnVersion: numberValue(proposal.based_on_version, 1),
        status: proposal.status as RecipeChangeProposal["status"],
        proposedIngredients: Array.isArray(proposal.proposed_ingredients)
          ? (proposal.proposed_ingredients as IngredientAmount[])
          : [],
        note: text(proposal.note),
        createdAt: text(proposal.created_at),
        reviewedAt: optionalText(proposal.reviewed_at),
        reviewedBy: optionalText(proposal.reviewed_by)
      })
    ),
    recipeOrigins: originRows.map(
      (origin): RecipeCopyOrigin => ({
        id: text(origin.id),
        recipeId: text(origin.recipe_id),
        sourceRecipeId: text(origin.source_recipe_id),
        shareId: optionalText(origin.share_id),
        lastAppliedRevisionId: optionalText(origin.last_applied_revision_id),
        updatesEnabled: Boolean(origin.updates_enabled)
      })
    )
  };
}
