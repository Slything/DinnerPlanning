import type {
  IngredientAmount,
  PantryItem,
  PantryReviewLine,
  PlannedMeal,
  Recipe,
  ShoppingList,
  ShoppingListItem,
  WeeklyPlan
} from "@/lib/domain/types";
import {
  canCombine,
  canonicalizeIngredient,
  fromBaseForDisplay,
  normalizeUnit,
  toBaseQuantity
} from "@/lib/domain/quantities";

interface Requirement {
  ingredient: IngredientAmount;
  plannedMealId: string;
  recipeId: string;
  quantity: number | null;
}

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function currentRecipeVersion(recipe: Recipe) {
  return (
    recipe.versions.find((version) => version.version === recipe.currentVersion) ??
    recipe.versions.at(-1)!
  );
}

export function collectRequirements(
  plan: WeeklyPlan,
  recipes: Recipe[]
): Requirement[] {
  return plan.meals.flatMap((meal) => {
    if (meal.kind !== "recipe" || !meal.recipeId) return [];
    const recipe = recipes.find((candidate) => candidate.id === meal.recipeId);
    if (!recipe) return [];
    const version = currentRecipeVersion(recipe);
    return version.ingredients.map((ingredient) => ({
      ingredient,
      plannedMealId: meal.id,
      recipeId: recipe.id,
      quantity: ingredient.quantity
    }));
  });
}

export function aggregateRequirements(
  requirements: Requirement[]
): Array<{
  ingredient: IngredientAmount;
  quantity: number | null;
  sources: Requirement[];
}> {
  const groups: Array<{
    ingredient: IngredientAmount;
    quantity: number | null;
    sources: Requirement[];
  }> = [];

  for (const requirement of requirements) {
    const base = toBaseQuantity(
      requirement.quantity,
      requirement.ingredient.unit
    );
    const normalized: IngredientAmount = {
      ...requirement.ingredient,
      unit: base.unit,
      dimension: base.dimension
    };
    const match = groups.find(
      (group) =>
        group.ingredient.canonicalName === normalized.canonicalName &&
        canCombine(group.ingredient, normalized)
    );
    if (!match) {
      groups.push({
        ingredient: normalized,
        quantity: base.quantity,
        sources: [requirement]
      });
      continue;
    }
    if (match.quantity === null || base.quantity === null) {
      match.quantity = null;
    } else {
      match.quantity += base.quantity;
    }
    match.sources.push(requirement);
  }
  return groups;
}

function compatiblePantryItem(
  pantry: PantryItem[],
  ingredient: IngredientAmount
): PantryItem | undefined {
  return pantry.find((item) => {
    if (item.canonicalName !== ingredient.canonicalName) return false;
    if (item.dimension !== ingredient.dimension) return false;
    if (item.dimension !== "package") return true;
    return normalizeUnit(item.unit).unit === normalizeUnit(ingredient.unit).unit;
  });
}

export function buildPantryReview(
  plan: WeeklyPlan,
  recipes: Recipe[],
  pantry: PantryItem[]
): PantryReviewLine[] {
  return aggregateRequirements(collectRequirements(plan, recipes)).map(
    ({ ingredient, quantity }) => {
      const pantryItem = compatiblePantryItem(pantry, ingredient);
      const pantryBase = pantryItem
        ? toBaseQuantity(pantryItem.quantity, pantryItem.unit)
        : null;
      const available = pantryBase?.quantity ?? null;
      const allocated =
        quantity === null || available === null
          ? null
          : Math.min(quantity, available);
      const display = fromBaseForDisplay(quantity, ingredient.unit);
      const availableDisplay = fromBaseForDisplay(
        available,
        pantryBase?.unit ?? ingredient.unit
      );
      return {
        canonicalName: ingredient.canonicalName,
        name: ingredient.name,
        requiredQuantity: display.quantity,
        availableQuantity: availableDisplay.quantity,
        allocatedQuantity:
          allocated === null
            ? null
            : fromBaseForDisplay(allocated, ingredient.unit).quantity,
        unit: display.unit,
        dimension: ingredient.dimension,
        aisle: ingredient.aisle,
        unresolved:
          pantryItem !== undefined &&
          (pantryItem.quantity === null || pantryItem.needsConfirmation)
      };
    }
  );
}

export function generateShoppingList(
  plan: WeeklyPlan,
  recipes: Recipe[],
  pantry: PantryItem[],
  previous?: ShoppingList | null
): ShoppingList {
  const generatedAt = new Date().toISOString();
  const previousByKey = new Map(
    previous?.items.map((item) => [
      `${item.canonicalName}:${item.unit}`,
      item
    ]) ?? []
  );

  const generatedItems: ShoppingListItem[] = [];
  for (const group of aggregateRequirements(
    collectRequirements(plan, recipes)
  )) {
    const pantryItem = compatiblePantryItem(pantry, group.ingredient);
    const pantryBase = pantryItem
      ? toBaseQuantity(pantryItem.quantity, pantryItem.unit)
      : null;
    let needed = group.quantity;

    if (
      needed !== null &&
      pantryBase?.quantity !== null &&
      pantryBase?.quantity !== undefined &&
      !pantryItem?.needsConfirmation
    ) {
      needed = Math.max(needed - pantryBase.quantity, 0);
    }

    if (needed === 0) continue;
    const display = fromBaseForDisplay(needed, group.ingredient.unit);
    const key = `${group.ingredient.canonicalName}:${display.unit}`;
    const previousItem = previousByKey.get(key);
    generatedItems.push({
      id: previousItem?.id ?? id("shopping-item"),
      shoppingListId: previous?.id ?? "",
      name: group.ingredient.name,
      canonicalName: group.ingredient.canonicalName,
      quantity: display.quantity,
      unit: display.unit,
      dimension: group.ingredient.dimension,
      aisle: group.ingredient.aisle,
      checked: previousItem?.checked ?? false,
      manual: false,
      qualitative:
        needed === null
          ? group.ingredient.qualitative ?? "as-needed"
          : undefined,
      sources: group.sources.map((source) => ({
        plannedMealId: source.plannedMealId,
        recipeId: source.recipeId,
        ingredientId: source.ingredient.id,
        scaledQuantity: source.quantity
      })),
      updatedAt: generatedAt
    });
  }

  const manualItems =
    previous?.items.filter((item) => item.manual && !item.checked) ?? [];
  const listId = previous?.id ?? id("shopping-list");
  const items = [...generatedItems, ...manualItems].map((item) => ({
    ...item,
    shoppingListId: listId
  }));
  return {
    id: listId,
    householdId: plan.householdId,
    weeklyPlanId: plan.id,
    generatedAt,
    updatedAt: generatedAt,
    stale: false,
    items
  };
}

export function findPantryItem(
  pantry: PantryItem[],
  name: string
): PantryItem | undefined {
  const canonical = canonicalizeIngredient(name);
  return pantry.find((item) => item.canonicalName === canonical);
}

export function getMealRequirements(
  meal: PlannedMeal,
  recipes: Recipe[]
): IngredientAmount[] {
  if (!meal.recipeId) return [];
  const recipe = recipes.find((item) => item.id === meal.recipeId);
  if (!recipe) return [];
  const version = currentRecipeVersion(recipe);
  return version.ingredients.map((ingredient) => ({
    ...ingredient,
    quantity: ingredient.quantity
  }));
}
