import { describe, expect, it } from "vitest";
import type {
  PantryItem,
  Recipe,
  WeeklyPlan
} from "@/lib/domain/types";
import { createIngredient } from "@/lib/domain/quantities";
import {
  buildPantryReview,
  generateShoppingList
} from "@/lib/domain/shopping";

const householdId = "household-test";

function recipe(
  id: string,
  ingredientName: string,
  quantity: number,
  unit: string
): Recipe {
  return {
    id,
    householdId,
    title: id,
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
        id: `${id}-v1`,
        recipeId: id,
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: "member",
        note: "",
        yield: 4,
        ingredients: [
          createIngredient(
            `${id}-ingredient`,
            ingredientName,
            quantity,
            unit
          )
        ],
        instructions: []
      }
    ]
  };
}

function plan(recipeIds: string[]): WeeklyPlan {
  return {
    id: "plan",
    householdId,
    weekStart: "2026-06-07",
    updatedAt: "2026-06-05T00:00:00.000Z",
    meals: recipeIds.map((recipeId, index) => ({
      id: `meal-${index}`,
      householdId,
      date: `2026-06-${String(index + 7).padStart(2, "0")}`,
      kind: "recipe",
      recipeId,
      servings: 4
    }))
  };
}

function pantryOnion(quantity: number | null): PantryItem {
  return {
    id: "pantry-onion",
    householdId,
    name: "Onion",
    canonicalName: "onion",
    quantity,
    unit: "count",
    dimension: "count",
    aisle: "Produce",
    needsConfirmation: false,
    updatedAt: "2026-06-05T00:00:00.000Z"
  };
}

describe("shopping list generation", () => {
  it("combines two half onions into one onion", () => {
    const recipes = [
      recipe("recipe-a", "Onion", 0.5, "count"),
      recipe("recipe-b", "Onion", 0.5, "count")
    ];
    const list = generateShoppingList(plan(["recipe-a", "recipe-b"]), recipes, []);
    expect(list.items).toHaveLength(1);
    expect(list.items[0].quantity).toBe(1);
    expect(list.items[0].unit).toBe("count");
  });

  it("subtracts exact pantry stock from combined requirements", () => {
    const recipes = [
      recipe("recipe-a", "Onion", 0.5, "count"),
      recipe("recipe-b", "Onion", 0.5, "count")
    ];
    const list = generateShoppingList(
      plan(["recipe-a", "recipe-b"]),
      recipes,
      [pantryOnion(1)]
    );
    expect(list.items).toHaveLength(0);
  });

  it("shops only for the remaining quantity after partial stock", () => {
    const recipes = [recipe("recipe-a", "Onion", 2, "count")];
    const list = generateShoppingList(plan(["recipe-a"]), recipes, [
      pantryOnion(0.5)
    ]);
    expect(list.items[0].quantity).toBe(1.5);
  });

  it("requires a decision for pantry stock with unknown quantity", () => {
    const recipes = [recipe("recipe-a", "Onion", 1, "count")];
    const review = buildPantryReview(plan(["recipe-a"]), recipes, [
      pantryOnion(null)
    ]);
    expect(review[0].unresolved).toBe(true);
    expect(review[0].availableQuantity).toBeNull();
  });

  it("does not combine incompatible package units", () => {
    const recipes = [
      recipe("recipe-a", "Tomato sauce", 1, "can"),
      recipe("recipe-b", "Tomato sauce", 8, "oz")
    ];
    const list = generateShoppingList(plan(["recipe-a", "recipe-b"]), recipes, []);
    expect(list.items).toHaveLength(2);
  });
});
