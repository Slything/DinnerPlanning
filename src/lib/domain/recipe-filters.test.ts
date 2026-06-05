import { describe, expect, it } from "vitest";
import type {
  CookingSession,
  IngredientCatalogEntry,
  Recipe
} from "@/lib/domain/types";
import {
  filterAndSortRecipes,
  searchIngredientCatalog
} from "@/lib/domain/recipe-filters";

function recipe(
  id: string,
  minutes: number,
  favorite = false
): Recipe {
  return {
    id,
    householdId: "household",
    title: id,
    description: "",
    prepMinutes: minutes,
    cookMinutes: 0,
    tags: [],
    favorite,
    visibility: "private",
    currentVersion: 1,
    createdAt: `2026-01-0${minutes % 9 + 1}T00:00:00.000Z`,
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
          {
            id: `${id}-ingredient`,
            name: id === "tacos" ? "Yellow onion" : "Pasta",
            canonicalName: id === "tacos" ? "yellow onion" : "pasta",
            quantity: 1,
            unit: "count",
            dimension: "count",
            aisle: "Produce"
          }
        ],
        instructions: []
      }
    ]
  };
}

function session(recipeId: string, cookedAt: string): CookingSession {
  return {
    id: `${recipeId}-session`,
    householdId: "household",
    plannedMealId: "meal",
    recipeId,
    recipeVersion: 1,
    servings: 4,
    cookedAt,
    cookedBy: "member",
    notes: "",
    adjustments: [],
    usage: []
  };
}

describe("recipe browsing", () => {
  it("puts never-cooked recipes first, then the least recently cooked", () => {
    const result = filterAndSortRecipes(
      [recipe("recent", 60), recipe("never", 20), recipe("older", 40)],
      [
        session("recent", "2026-06-01T00:00:00.000Z"),
        session("older", "2026-02-01T00:00:00.000Z")
      ],
      {
        query: "",
        favoritesOnly: false,
        neverCookedOnly: false,
        maxMinutes: null,
        sort: "least-recent"
      }
    );
    expect(result.map((item) => item.id)).toEqual([
      "never",
      "older",
      "recent"
    ]);
  });

  it("searches ingredients and combines favorite/time filters", () => {
    const result = filterAndSortRecipes(
      [recipe("tacos", 30, true), recipe("pasta", 70, true)],
      [],
      {
        query: "onion",
        favoritesOnly: true,
        neverCookedOnly: false,
        maxMinutes: 45,
        sort: "fastest"
      }
    );
    expect(result.map((item) => item.id)).toEqual(["tacos"]);
  });
});

describe("ingredient catalog suggestions", () => {
  it("prioritizes prefix matches and limits suggestions", () => {
    const catalog: IngredientCatalogEntry[] = [
      {
        id: "yellow",
        householdId: "household",
        canonicalName: "yellow onion",
        displayName: "Yellow onion",
        defaultUnit: "count",
        dimension: "count",
        aisle: "Produce",
        aliases: ["onion"],
        usageCount: 2,
        lastUsedAt: "2026-06-01T00:00:00.000Z"
      },
      {
        id: "powder",
        householdId: "household",
        canonicalName: "onion powder",
        displayName: "Onion powder",
        defaultUnit: "tsp",
        dimension: "volume",
        aisle: "Pantry",
        aliases: [],
        usageCount: 1,
        lastUsedAt: "2026-05-01T00:00:00.000Z"
      }
    ];
    expect(searchIngredientCatalog(catalog, "on", 1)[0].id).toBe("powder");
  });
});
