import { describe, expect, it } from "vitest";
import type { PantryItem, PlannedMeal, Recipe } from "@/lib/domain/types";
import { createAdjustment, markMealCooked } from "@/lib/domain/cooking";
import { createIngredient } from "@/lib/domain/quantities";

const householdId = "household-test";
const memberId = "member-test";

function testRecipe(): Recipe {
  return {
    id: "recipe-test",
    householdId,
    title: "Test dinner",
    description: "",
    prepMinutes: 0,
    cookMinutes: 0,
    tags: [],
    favorite: false,
    visibility: "private",
    currentVersion: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    versions: [
      {
        id: "recipe-test-v1",
        recipeId: "recipe-test",
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: memberId,
        note: "",
        yield: 4,
        ingredients: [
          createIngredient("onion", "Onion", 1, "count"),
          createIngredient("milk", "Milk", 1.5, "cups"),
          createIngredient("salt", "Salt", 1, "tsp")
        ],
        instructions: []
      }
    ]
  };
}

const meal: PlannedMeal = {
  id: "meal-test",
  householdId,
  date: "2026-06-05",
  kind: "recipe",
  recipeId: "recipe-test",
  servings: 4
};

function pantry(
  id: string,
  name: string,
  quantity: number | null,
  unit: string,
  dimension: PantryItem["dimension"]
): PantryItem {
  return {
    id,
    householdId,
    name,
    canonicalName: name.toLowerCase(),
    quantity,
    unit,
    dimension,
    aisle: "Pantry",
    needsConfirmation: false,
    updatedAt: "2026-06-05T00:00:00.000Z"
  };
}

describe("cooking feedback", () => {
  it("deducts actual extra use and proposes the new recipe quantity", () => {
    const result = markMealCooked({
      householdId,
      memberId,
      meal,
      recipe: testRecipe(),
      pantry: [pantry("stock-onion", "Onion", 3, "count", "count")],
      notes: "",
      adjustments: [
        createAdjustment({
          ingredientId: "onion",
          name: "Onion",
          intent: "actual",
          kind: "more",
          quantity: 0.5,
          unit: "count"
        })
      ]
    });
    expect(result.pantry[0].quantity).toBe(1.5);
    expect(
      result.proposal?.proposedIngredients.find(
        (ingredient) => ingredient.id === "onion"
      )?.quantity
    ).toBe(1.5);
  });

  it("uses future-only milk feedback for the proposal but not current extra consumption", () => {
    const result = markMealCooked({
      householdId,
      memberId,
      meal,
      recipe: testRecipe(),
      pantry: [pantry("stock-milk", "Milk", 5, "cups", "volume")],
      notes: "",
      adjustments: [
        createAdjustment({
          ingredientId: "milk",
          name: "Milk",
          intent: "next-time",
          kind: "more",
          quantity: 1,
          unit: "cups"
        })
      ]
    });
    expect(result.pantry[0].quantity).toBeCloseTo(3.5);
    expect(
      result.proposal?.proposedIngredients.find(
        (ingredient) => ingredient.id === "milk"
      )?.quantity
    ).toBeCloseTo(2.5);
  });

  it("does not consume an ingredient marked skipped", () => {
    const result = markMealCooked({
      householdId,
      memberId,
      meal,
      recipe: testRecipe(),
      pantry: [pantry("stock-salt", "Salt", 10, "tsp", "volume")],
      notes: "",
      adjustments: [
        createAdjustment({
          ingredientId: "salt",
          name: "Salt",
          intent: "actual",
          kind: "skipped",
          quantity: 0,
          unit: "tsp"
        })
      ]
    });
    expect(result.pantry[0].quantity).toBe(10);
  });

  it("consumes and proposes an unplanned ingredient", () => {
    const result = markMealCooked({
      householdId,
      memberId,
      meal,
      recipe: testRecipe(),
      pantry: [
        pantry("stock-paprika", "Smoked paprika", 4, "tbsp", "volume")
      ],
      notes: "",
      adjustments: [
        createAdjustment({
          name: "Smoked paprika",
          intent: "actual",
          kind: "new",
          quantity: 1,
          unit: "tbsp"
        })
      ]
    });
    expect(result.pantry[0].quantity).toBeCloseTo(3);
    expect(
      result.proposal?.proposedIngredients.some(
        (ingredient) => ingredient.canonicalName === "smoked paprika"
      )
    ).toBe(true);
  });

  it("flags approximate actual usage for pantry confirmation", () => {
    const result = markMealCooked({
      householdId,
      memberId,
      meal,
      recipe: testRecipe(),
      pantry: [pantry("stock-salt", "Salt", 10, "tsp", "volume")],
      notes: "",
      adjustments: [
        createAdjustment({
          ingredientId: "salt",
          name: "Salt",
          intent: "actual",
          kind: "more",
          quantity: null,
          unit: "tsp",
          qualitative: "some"
        })
      ]
    });
    expect(result.pantry[0].needsConfirmation).toBe(true);
  });
});
