import { describe, expect, it } from "vitest";
import type { CookingSession, Recipe } from "@/lib/domain/types";
import { rankRecipeSuggestions } from "@/lib/domain/suggestions";

function recipe(id: string, favorite = false): Recipe {
  return {
    id,
    householdId: "household",
    title: id,
    description: "",
    prepMinutes: 0,
    cookMinutes: 0,
    tags: [],
    favorite,
    visibility: "private",
    currentVersion: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    versions: []
  };
}

function session(recipeId: string, cookedAt: string): CookingSession {
  return {
    id: `session-${recipeId}`,
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

describe("recipe suggestions", () => {
  it("penalizes meals cooked in the previous week", () => {
    const ranked = rankRecipeSuggestions({
      recipes: [recipe("recent", true), recipe("older")],
      sessions: [
        session("recent", "2026-06-02T00:00:00.000Z"),
        session("older", "2026-04-01T00:00:00.000Z")
      ],
      plannedMeals: [],
      now: new Date("2026-06-05T00:00:00.000Z")
    });
    expect(ranked[0].recipe.id).toBe("older");
    expect(ranked.at(-1)?.reason).toBe("Recently cooked");
  });

  it("excludes recipes already planned this week", () => {
    const ranked = rankRecipeSuggestions({
      recipes: [recipe("planned"), recipe("free")],
      sessions: [],
      plannedMeals: [
        {
          id: "meal",
          householdId: "household",
          date: "2026-06-07",
          kind: "recipe",
          recipeId: "planned",
          servings: 4
        }
      ],
      now: new Date("2026-06-05T00:00:00.000Z")
    });
    expect(ranked.map((item) => item.recipe.id)).toEqual(["free"]);
  });
});
