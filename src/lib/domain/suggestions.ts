import type { CookingSession, PlannedMeal, Recipe } from "@/lib/domain/types";

export interface RecipeSuggestion {
  recipe: Recipe;
  score: number;
  reason: string;
}

export function rankRecipeSuggestions(input: {
  recipes: Recipe[];
  sessions: CookingSession[];
  plannedMeals: PlannedMeal[];
  now?: Date;
}): RecipeSuggestion[] {
  const now = input.now ?? new Date();
  const plannedRecipeIds = new Set(
    input.plannedMeals.map((meal) => meal.recipeId).filter(Boolean)
  );

  return input.recipes
    .filter((recipe) => !plannedRecipeIds.has(recipe.id))
    .map((recipe) => {
      const lastSession = input.sessions
        .filter((session) => session.recipeId === recipe.id)
        .sort((a, b) => b.cookedAt.localeCompare(a.cookedAt))[0];
      const daysSince = lastSession
        ? Math.floor(
            (now.getTime() - new Date(lastSession.cookedAt).getTime()) /
              86_400_000
          )
        : 365;
      const recentPenalty = daysSince < 7 ? 80 : daysSince < 14 ? 25 : 0;
      const favoriteBonus = recipe.favorite ? 18 : 0;
      const score = Math.min(daysSince, 120) + favoriteBonus - recentPenalty;
      const reason =
        daysSince >= 365
          ? "Not cooked yet"
          : daysSince < 7
            ? "Recently cooked"
            : `${daysSince} days since last cooked`;
      return { recipe, score, reason };
    })
    .sort((left, right) => right.score - left.score);
}

