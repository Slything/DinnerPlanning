import type {
  CookingAdjustment,
  CookingSession,
  IngredientAmount,
  IngredientUsage,
  PantryItem,
  PantryTransaction,
  PlannedMeal,
  Recipe,
  RecipeChangeProposal
} from "@/lib/domain/types";
import {
  canonicalizeIngredient,
  normalizeUnit,
  toBaseQuantity
} from "@/lib/domain/quantities";
import { currentRecipeVersion } from "@/lib/domain/shopping";

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

interface CookingResult {
  session: CookingSession;
  proposal: RecipeChangeProposal | null;
  pantry: PantryItem[];
  transactions: PantryTransaction[];
}

function adjustmentFor(
  ingredient: IngredientAmount,
  adjustments: CookingAdjustment[]
) {
  return adjustments.filter(
    (item) =>
      item.intent === "actual" &&
      ((item.ingredientId && item.ingredientId === ingredient.id) ||
        item.canonicalName === ingredient.canonicalName)
  );
}

function calculateActualUsage(
  ingredient: IngredientAmount,
  baseQuantity: number | null,
  adjustments: CookingAdjustment[]
): { quantity: number | null; approximate: boolean } {
  let quantity = baseQuantity;
  let approximate = baseQuantity === null;
  for (const adjustment of adjustmentFor(ingredient, adjustments)) {
    if (adjustment.kind === "skipped") {
      quantity = 0;
      continue;
    }
    if (adjustment.quantity === null) {
      approximate = true;
      continue;
    }
    if (quantity === null) {
      quantity = adjustment.kind === "new" ? adjustment.quantity : null;
      continue;
    }
    quantity +=
      adjustment.kind === "less"
        ? -Math.abs(adjustment.quantity)
        : Math.abs(adjustment.quantity);
  }
  return {
    quantity: quantity === null ? null : Math.max(quantity, 0),
    approximate
  };
}

function applyProposalAdjustments(
  base: IngredientAmount[],
  adjustments: CookingAdjustment[]
): IngredientAmount[] {
  const proposed = base.map((ingredient) => ({ ...ingredient }));
  for (const adjustment of adjustments) {
    const shouldPropose =
      adjustment.intent === "next-time" ||
      (adjustment.intent === "actual" && adjustment.kind !== "skipped");
    if (!shouldPropose) continue;
    const existing = proposed.find(
      (ingredient) =>
        (adjustment.ingredientId &&
          ingredient.id === adjustment.ingredientId) ||
        ingredient.canonicalName === adjustment.canonicalName
    );
    if (!existing) {
      proposed.push({
        id: id("ingredient"),
        name: adjustment.name,
        canonicalName: adjustment.canonicalName,
        quantity: adjustment.quantity,
        unit: adjustment.unit,
        dimension: adjustment.dimension,
        aisle: adjustment.aisle,
        qualitative:
          adjustment.quantity === null
            ? adjustment.qualitative ?? "as-needed"
            : undefined
      });
      continue;
    }
    if (adjustment.kind === "skipped") {
      existing.optional = true;
      continue;
    }
    if (adjustment.quantity === null) {
      existing.qualitative = adjustment.qualitative ?? "as-needed";
      continue;
    }
    const existingBase = toBaseQuantity(existing.quantity, existing.unit);
    const adjustmentBase = toBaseQuantity(
      adjustment.quantity,
      adjustment.unit
    );
    if (
      existingBase.quantity !== null &&
      adjustmentBase.quantity !== null &&
      existingBase.dimension === adjustmentBase.dimension
    ) {
      const direction = adjustment.kind === "less" ? -1 : 1;
      const updated = Math.max(
        existingBase.quantity + direction * Math.abs(adjustmentBase.quantity),
        0
      );
      const normalized = normalizeUnit(existing.unit);
      existing.quantity = updated / normalized.factor;
    }
  }
  return proposed;
}

export function markMealCooked(input: {
  householdId: string;
  memberId: string;
  meal: PlannedMeal;
  recipe: Recipe;
  pantry: PantryItem[];
  notes: string;
  adjustments: CookingAdjustment[];
  cookedAt?: string;
}): CookingResult {
  const cookedAt = input.cookedAt ?? new Date().toISOString();
  const version = currentRecipeVersion(input.recipe);
  const sessionId = id("cooking-session");
  const usage: IngredientUsage[] = version.ingredients.map((ingredient) => {
    const actual = calculateActualUsage(
      ingredient,
      ingredient.quantity,
      input.adjustments
    );
    return {
      id: id("usage"),
      cookingSessionId: sessionId,
      ingredientId: ingredient.id,
      name: ingredient.name,
      canonicalName: ingredient.canonicalName,
      quantity: actual.quantity,
      unit: ingredient.unit,
      dimension: ingredient.dimension,
      approximate: actual.approximate
    };
  });

  for (const adjustment of input.adjustments.filter(
    (item) =>
      item.intent === "actual" &&
      item.kind === "new" &&
      !usage.some(
        (used) => used.canonicalName === item.canonicalName
      )
  )) {
    usage.push({
      id: id("usage"),
      cookingSessionId: sessionId,
      name: adjustment.name,
      canonicalName: adjustment.canonicalName,
      quantity: adjustment.quantity,
      unit: adjustment.unit,
      dimension: adjustment.dimension,
      approximate: adjustment.quantity === null
    });
  }

  const pantry = input.pantry.map((item) => ({ ...item }));
  const transactions: PantryTransaction[] = [];
  for (const used of usage) {
    const pantryItem = pantry.find(
      (item) =>
        item.canonicalName === used.canonicalName &&
        item.dimension === used.dimension
    );
    if (!pantryItem) continue;
    if (used.quantity === null || used.approximate) {
      pantryItem.needsConfirmation = true;
      pantryItem.updatedAt = cookedAt;
      transactions.push({
        id: id("pantry-tx"),
        pantryItemId: pantryItem.id,
        householdId: input.householdId,
        kind: "cooking",
        quantityDelta: null,
        unit: used.unit,
        note: `Approximate use for ${input.recipe.title}`,
        createdAt: cookedAt,
        createdBy: input.memberId
      });
      continue;
    }
    if (pantryItem.quantity === null) {
      pantryItem.needsConfirmation = true;
      pantryItem.updatedAt = cookedAt;
      continue;
    }
    const stockBase = toBaseQuantity(pantryItem.quantity, pantryItem.unit);
    const usageBase = toBaseQuantity(used.quantity, used.unit);
    if (
      stockBase.quantity === null ||
      usageBase.quantity === null ||
      stockBase.dimension !== usageBase.dimension
    ) {
      continue;
    }
    const normalizedStock = normalizeUnit(pantryItem.unit);
    pantryItem.quantity =
      Math.max(stockBase.quantity - usageBase.quantity, 0) /
      normalizedStock.factor;
    pantryItem.updatedAt = cookedAt;
    transactions.push({
      id: id("pantry-tx"),
      pantryItemId: pantryItem.id,
      householdId: input.householdId,
      kind: "cooking",
      quantityDelta: -used.quantity,
      unit: used.unit,
      note: `Used for ${input.recipe.title}`,
      createdAt: cookedAt,
      createdBy: input.memberId
    });
  }

  const proposedIngredients = applyProposalAdjustments(
    version.ingredients,
    input.adjustments
  );
  const hasProposal = input.adjustments.length > 0;
  const session: CookingSession = {
    id: sessionId,
    householdId: input.householdId,
    plannedMealId: input.meal.id,
    recipeId: input.recipe.id,
    recipeVersion: version.version,
    servings: input.meal.servings,
    cookedAt,
    cookedBy: input.memberId,
    notes: input.notes,
    adjustments: input.adjustments,
    usage
  };
  const proposal: RecipeChangeProposal | null = hasProposal
    ? {
        id: id("proposal"),
        householdId: input.householdId,
        cookingSessionId: sessionId,
        recipeId: input.recipe.id,
        basedOnVersion: version.version,
        status: "pending",
        proposedIngredients,
        note:
          input.notes ||
          "Ingredient adjustments captured during the cooking review.",
        createdAt: cookedAt
      }
    : null;
  return { session, proposal, pantry, transactions };
}

export function createAdjustment(input: {
  ingredientId?: string;
  name: string;
  intent: CookingAdjustment["intent"];
  kind: CookingAdjustment["kind"];
  quantity: number | null;
  unit: string;
  qualitative?: CookingAdjustment["qualitative"];
  note?: string;
  aisle?: CookingAdjustment["aisle"];
}): CookingAdjustment {
  const normalized = normalizeUnit(input.unit);
  return {
    id: id("adjustment"),
    ingredientId: input.ingredientId,
    name: input.name,
    canonicalName: canonicalizeIngredient(input.name),
    intent: input.intent,
    kind: input.kind,
    quantity: input.quantity,
    unit: input.unit,
    dimension: normalized.dimension,
    qualitative: input.qualitative,
    aisle: input.aisle ?? "Other",
    note: input.note
  };
}
