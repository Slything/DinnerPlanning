import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeUnit,
  toBaseQuantity
} from "@/lib/domain/quantities";
import { getMealRequirements } from "@/lib/domain/shopping";
import { loadAppState } from "@/lib/supabase/app-state";
import type { AuthenticatedUser } from "@/lib/supabase/server";

export async function rebuildPantryAllocations(
  supabase: SupabaseClient,
  user: AuthenticatedUser,
  options?: { weekStart?: string }
) {
  const state = await loadAppState(supabase, user, options);
  if (!state) return;
  const plannedMealIds = state.weeklyPlan.meals.map((meal) => meal.id);
  if (plannedMealIds.length) {
    const { error: deleteError } = await supabase
      .from("pantry_allocations")
      .delete()
      .eq("household_id", state.household.id)
      .in("planned_meal_id", plannedMealIds);
    if (deleteError) throw deleteError;
  }

  const requirements = new Map<
    string,
    {
      plannedMealId: string;
      pantryItemId: string;
      quantity: number | null;
      unit: string;
    }
  >();
  for (const meal of [...state.weeklyPlan.meals]
    .filter((candidate) => !candidate.cookedAt)
    .sort((left, right) => left.date.localeCompare(right.date))) {
    for (const ingredient of getMealRequirements(meal, state.recipes)) {
      const pantryItem = state.pantry.find(
        (item) =>
          item.canonicalName === ingredient.canonicalName &&
          item.dimension === ingredient.dimension &&
          (item.dimension !== "package" ||
            normalizeUnit(item.unit).unit ===
              normalizeUnit(ingredient.unit).unit)
      );
      if (!pantryItem) continue;
      const base = toBaseQuantity(ingredient.quantity, ingredient.unit);
      const pantryUnit = normalizeUnit(pantryItem.unit);
      const quantity =
        base.quantity === null ? null : base.quantity / pantryUnit.factor;
      const key = `${meal.id}:${pantryItem.id}`;
      const existing = requirements.get(key);
      if (!existing) {
        requirements.set(key, {
          plannedMealId: meal.id,
          pantryItemId: pantryItem.id,
          quantity,
          unit: pantryItem.unit
        });
      } else {
        existing.quantity =
          existing.quantity === null || quantity === null
            ? null
            : existing.quantity + quantity;
      }
    }
  }

  const remaining = new Map(
    state.pantry.map((item) => [item.id, item.quantity])
  );
  const rows = Array.from(requirements.values()).map((requirement) => {
    const available = remaining.get(requirement.pantryItemId) ?? null;
    const allocated =
      available === null || requirement.quantity === null
        ? null
        : Math.min(available, requirement.quantity);
    if (available !== null && allocated !== null) {
      remaining.set(
        requirement.pantryItemId,
        Math.max(available - allocated, 0)
      );
    }
    return {
      household_id: state.household.id,
      planned_meal_id: requirement.plannedMealId,
      pantry_item_id: requirement.pantryItemId,
      quantity: allocated,
      unit: requirement.unit
    };
  });
  if (!rows.length) return;
  const { error } = await supabase.from("pantry_allocations").insert(rows);
  if (error) throw error;
}
