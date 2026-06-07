import { format, parseISO, startOfWeek } from "date-fns";
import { NextResponse } from "next/server";
import { z } from "zod";
import type {
  CookingAdjustment,
  IngredientAmount
} from "@/lib/domain/types";
import { markMealCooked } from "@/lib/domain/cooking";
import {
  canonicalizeIngredient,
  inferAisle,
  normalizeUnit
} from "@/lib/domain/quantities";
import { generateShoppingList } from "@/lib/domain/shopping";
import { visibleRecipeTags } from "@/lib/domain/recipe-labels";
import { requireCompatibleModel } from "@/lib/openrouter/models";
import { loadAppState } from "@/lib/supabase/app-state";
import { rebuildPantryAllocations } from "@/lib/supabase/allocations";
import { requireUser } from "@/lib/supabase/server";

const requestSchema = z.object({
  action: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({})
});

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numericValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeRecipePayload(
  recipe: Record<string, unknown>,
  householdName: string
): Record<string, unknown> {
  return {
    ...recipe,
    sourceCreator: stringValue(recipe.sourceCreator) || householdName,
    tags: Array.isArray(recipe.tags)
      ? visibleRecipeTags(recipe.tags.map(String))
      : []
  };
}

export async function POST(request: Request) {
  try {
    const { action, payload } = requestSchema.parse(await request.json());
    const { supabase, user } = await requireUser();
    if (!supabase || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const { data: membership, error: membershipError } = await supabase
      .from("household_members")
      .select("household_id,households(name,week_starts_on)")
      .eq("user_id", user.id)
      .single();
    if (membershipError || !membership) {
      return NextResponse.json(
        { error: "Household membership required." },
        { status: 403 }
      );
    }
    const membershipRow = membership as unknown as {
      household_id: string;
      households:
        | { name: string; week_starts_on: number }
        | Array<{ name: string; week_starts_on: number }>;
    };
    const householdId = membershipRow.household_id;
    const householdRelation = Array.isArray(membershipRow.households)
      ? membershipRow.households[0]
      : membershipRow.households;
    const householdName = householdRelation?.name ?? "Household";

    if (action === "scheduleMeal") {
      const date = stringValue(payload.date);
      const kind = stringValue(payload.kind);
      if (!date || !["recipe", "leftovers", "dining-out"].includes(kind)) {
        throw new Error("A valid meal date and type are required.");
      }
      const weekStartsOn = householdRelation?.week_starts_on === 1 ? 1 : 0;
      const weekStart = format(
        startOfWeek(parseISO(date), { weekStartsOn }),
        "yyyy-MM-dd"
      );
      const recipeId =
        kind === "recipe" ? stringValue(payload.recipeId) : null;
      if (kind === "recipe" && !recipeId) {
        throw new Error("Choose a recipe for this meal.");
      }
      const { error } = await supabase.rpc("upsert_weekly_plan_meal", {
        plan_week_start: weekStart,
        target_meal_date: date,
        meal_kind: kind,
        target_recipe: recipeId,
        meal_servings: numericValue(payload.servings, 4)
      });
      if (error) throw error;
    } else if (action === "removeMeal") {
      const { error } = await supabase
        .from("planned_meals")
        .delete()
        .eq("id", stringValue(payload.mealId))
        .eq("household_id", householdId);
      if (error) throw error;
      await supabase
        .from("shopping_lists")
        .update({ stale: true })
        .eq("household_id", householdId)
        .is("completed_at", null);
    } else if (action === "addRecipe") {
      const recipe = payload.recipe as Record<string, unknown> | undefined;
      if (!recipe) throw new Error("Recipe data is required.");
      const recipePayload = sanitizeRecipePayload(recipe, householdName);
      const { data: recipeId, error } = await supabase.rpc("create_recipe_with_catalog", {
        recipe_payload: recipePayload
      });
      if (error) throw error;
      if (recipePayload.visibility === "public") {
        const { error: visibilityError } = await supabase.rpc(
          "set_recipe_visibility",
          {
            target_recipe: recipeId,
            next_visibility: "public"
          }
        );
        if (visibilityError) throw visibilityError;
      }
    } else if (action === "updateRecipe") {
      const recipeId = stringValue(payload.recipeId);
      const recipe = payload.recipe as Record<string, unknown> | undefined;
      if (!recipeId || !recipe) throw new Error("Recipe data is required.");
      const recipePayload = sanitizeRecipePayload(recipe, householdName);
      const { error } = await supabase.rpc("update_recipe_with_catalog", {
        target_recipe: recipeId,
        recipe_payload: recipePayload
      });
      if (error) throw error;
    } else if (action === "removeRecipe") {
      const recipeId = stringValue(payload.recipeId);
      if (!recipeId) throw new Error("Choose a recipe to delete.");
      const { error } = await supabase
        .from("recipes")
        .delete()
        .eq("id", recipeId)
        .eq("household_id", householdId);
      if (error) throw error;
      await supabase
        .from("shopping_lists")
        .update({ stale: true })
        .eq("household_id", householdId)
        .is("completed_at", null);
    } else if (action === "toggleFavorite") {
      const recipeId = stringValue(payload.recipeId);
      const { data: recipe, error: readError } = await supabase
        .from("recipes")
        .select("favorite")
        .eq("id", recipeId)
        .eq("household_id", householdId)
        .single();
      if (readError) throw readError;
      const { error } = await supabase
        .from("recipes")
        .update({ favorite: !recipe.favorite })
        .eq("id", recipeId)
        .eq("household_id", householdId);
      if (error) throw error;
    } else if (action === "upsertPantry") {
      const name = stringValue(payload.name).trim();
      const unit = stringValue(payload.unit) || "count";
      if (!name) throw new Error("Pantry item name is required.");
      const normalized = normalizeUnit(unit);
      const pantryRow = {
        household_id: householdId,
        name,
        canonical_name: canonicalizeIngredient(name),
        quantity:
          payload.quantity === null ? null : numericValue(payload.quantity),
        unit,
        dimension: normalized.dimension,
        aisle: inferAisle(name),
        needs_confirmation: Boolean(payload.needsConfirmation)
      };
      const id = stringValue(payload.id);
      const result = id
        ? await supabase
            .from("pantry_items")
            .update(pantryRow)
            .eq("id", id)
            .eq("household_id", householdId)
            .select("id")
            .single()
        : await supabase
            .from("pantry_items")
            .upsert(pantryRow, {
              onConflict: "household_id,canonical_name,unit,dimension"
            })
            .select("id")
            .single();
      if (result.error) throw result.error;
      const { error: transactionError } = await supabase
        .from("pantry_transactions")
        .insert({
          pantry_item_id: result.data.id,
          household_id: householdId,
          kind: id ? "correction" : "manual",
          quantity_delta:
            payload.quantity === null ? null : numericValue(payload.quantity),
          unit,
          note: id ? "Pantry quantity updated" : "Added to pantry",
          created_by: user.id
        });
      if (transactionError) throw transactionError;
      await supabase
        .from("shopping_lists")
        .update({ stale: true })
        .eq("household_id", householdId)
        .is("completed_at", null);
    } else if (action === "removePantry") {
      const { error } = await supabase
        .from("pantry_items")
        .delete()
        .eq("id", stringValue(payload.id))
        .eq("household_id", householdId);
      if (error) throw error;
    } else if (action === "generateShoppingList") {
      const current = await loadAppState(supabase, user);
      if (!current) throw new Error("Household state is unavailable.");
      const generated = generateShoppingList(
        current.weeklyPlan,
        current.recipes,
        current.pantry,
        current.shoppingList
      );
      const { error } = await supabase.rpc("replace_shopping_list", {
        target_weekly_plan: current.weeklyPlan.id,
        generated_items: generated.items
      });
      if (error) throw error;
    } else if (action === "toggleShoppingItem") {
      const itemId = stringValue(payload.id);
      const { data: item, error: itemError } = await supabase
        .from("shopping_list_items")
        .select("checked")
        .eq("id", itemId)
        .eq("household_id", householdId)
        .single();
      if (itemError) throw itemError;
      const { error } = await supabase
        .from("shopping_list_items")
        .update({ checked: !item.checked })
        .eq("id", itemId)
        .eq("household_id", householdId);
      if (error) throw error;
    } else if (action === "addShoppingItem") {
      const current = await loadAppState(supabase, user);
      const name = stringValue(payload.name).trim();
      if (!current?.shoppingList || !name) {
        throw new Error("Generate a shopping list before adding an item.");
      }
      const { error } = await supabase.from("shopping_list_items").insert({
        shopping_list_id: current.shoppingList.id,
        household_id: householdId,
        name,
        canonical_name: canonicalizeIngredient(name),
        quantity: 1,
        unit: "count",
        dimension: "count",
        aisle: inferAisle(name),
        checked: false,
        manual: true,
        sources: []
      });
      if (error) throw error;
    } else if (action === "removeShoppingItem") {
      const { error } = await supabase
        .from("shopping_list_items")
        .delete()
        .eq("id", stringValue(payload.id))
        .eq("household_id", householdId);
      if (error) throw error;
    } else if (action === "markListStale") {
      const { error } = await supabase
        .from("shopping_lists")
        .update({ stale: true })
        .eq("household_id", householdId)
        .is("completed_at", null);
      if (error) throw error;
    } else if (action === "completeShopping") {
      const itemIds = Array.isArray(payload.itemIds)
        ? payload.itemIds.map(String)
        : [];
      const current = await loadAppState(supabase, user);
      if (!current?.shoppingList) throw new Error("Shopping list not found.");
      const { error } = await supabase.rpc("complete_shopping_list", {
        target_list: current.shoppingList.id,
        purchased_item_ids: itemIds
      });
      if (error) throw error;
    } else if (action === "cookMeal") {
      const current = await loadAppState(supabase, user);
      if (!current) throw new Error("Household state is unavailable.");
      const mealId = stringValue(payload.mealId);
      const meal = current.weeklyPlan.meals.find((item) => item.id === mealId);
      const recipe = current.recipes.find(
        (item) => item.id === meal?.recipeId
      );
      if (!meal || !recipe) throw new Error("Planned recipe meal not found.");
      const result = markMealCooked({
        householdId,
        memberId: user.id,
        meal,
        recipe,
        pantry: current.pantry,
        notes: stringValue(payload.notes),
        adjustments: (payload.adjustments ?? []) as CookingAdjustment[]
      });
      const { error } = await supabase.rpc("record_cooking_session", {
        target_meal_id: mealId,
        session_notes: stringValue(payload.notes),
        session_adjustments: result.session.adjustments,
        session_usages: result.session.usage,
        proposed_ingredients: result.proposal?.proposedIngredients ?? null
      });
      if (error) throw error;
    } else if (action === "reviewProposal") {
      const status = stringValue(payload.status);
      if (status !== "approved" && status !== "ignored") {
        throw new Error("Choose approve or ignore.");
      }
      const { error } = await supabase.rpc(
        "review_recipe_change_proposal",
        {
          proposal_id: stringValue(payload.proposalId),
          decision: status,
          reviewed_ingredients:
            (payload.ingredients as IngredientAmount[] | undefined) ?? null
        }
      );
      if (error) throw error;
    } else if (action === "setRecipeVisibility") {
      const recipeId = stringValue(payload.recipeId);
      const visibility =
        payload.visibility === "public" ? "public" : "private";
      const { error } = await supabase.rpc("set_recipe_visibility", {
        target_recipe: recipeId,
        next_visibility: visibility
      });
      if (error) throw error;
    } else if (action === "setAiModel") {
      const modelId = stringValue(payload.modelId).trim();
      if (modelId) {
        await requireCompatibleModel(modelId, false);
      }
      const { error } = await supabase
        .from("households")
        .update({ ai_model_id: modelId || null })
        .eq("id", householdId);
      if (error) throw error;
    } else if (action === "updateHousehold") {
      const name = stringValue(payload.name).trim();
      if (!name) throw new Error("Household name is required.");
      const { error } = await supabase
        .from("households")
        .update({ name })
        .eq("id", householdId);
      if (error) throw error;
    } else if (action === "updateMemberProfile") {
      const displayName = stringValue(payload.displayName).trim();
      const avatarColor =
        stringValue(payload.avatarColor).trim() || "#315c4a";
      const avatarUrl = stringValue(payload.avatarUrl).trim();
      if (!displayName) throw new Error("Display name is required.");
      const { error } = await supabase
        .from("household_members")
        .update({
          display_name: displayName,
          avatar_color: avatarColor,
          avatar_url: avatarUrl || null
        })
        .eq("household_id", householdId)
        .eq("user_id", user.id);
      if (error) throw error;
    } else if (action === "restoreRecipeVersion") {
      const { error } = await supabase.rpc("restore_recipe_version", {
        target_recipe: stringValue(payload.recipeId),
        target_version: numericValue(payload.version)
      });
      if (error) throw error;
    } else {
      throw new Error(`Unsupported action: ${action}`);
    }

    if (
      [
        "scheduleMeal",
        "removeMeal",
        "updateRecipe",
        "removeRecipe",
        "upsertPantry",
        "removePantry",
        "cookMeal",
        "reviewProposal",
        "restoreRecipeVersion"
      ].includes(action)
    ) {
      await rebuildPantryAllocations(supabase, user);
    }
    if (["reviewProposal", "restoreRecipeVersion", "updateRecipe"].includes(action)) {
      await supabase
        .from("shopping_lists")
        .update({ stale: true })
        .eq("household_id", householdId)
        .is("completed_at", null);
    }
    const state = await loadAppState(supabase, user);
    return NextResponse.json({ state });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Action failed." },
      { status: 400 }
    );
  }
}
