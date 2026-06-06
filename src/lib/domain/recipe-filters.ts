import type {
  CookingSession,
  Recipe,
  RecipeSortMode
} from "@/lib/domain/types";

export interface RecipeFilters {
  query: string;
  favoritesOnly: boolean;
  neverCookedOnly: boolean;
  quickCookOnly: boolean;
  sort: RecipeSortMode;
}

export function lastCookedAt(
  recipeId: string,
  sessions: CookingSession[]
): string | null {
  return (
    sessions
      .filter((session) => session.recipeId === recipeId)
      .map((session) => session.cookedAt)
      .sort((left, right) => right.localeCompare(left))[0] ?? null
  );
}

export function filterAndSortRecipes(
  recipes: Recipe[],
  sessions: CookingSession[],
  filters: RecipeFilters
): Recipe[] {
  const query = filters.query.trim().toLowerCase();
  const lastCooked = new Map(
    recipes.map((recipe) => [recipe.id, lastCookedAt(recipe.id, sessions)])
  );

  return recipes
    .filter((recipe) => {
      const version = recipe.versions.find(
        (candidate) => candidate.version === recipe.currentVersion
      );
      const haystack = [
        recipe.title,
        recipe.description,
        ...recipe.tags,
        ...(version?.ingredients.map((ingredient) => ingredient.name) ?? [])
      ]
        .join(" ")
        .toLowerCase();
      const isQuickCook = recipe.tags.some(
        (tag) => tag.toLowerCase() === "quick cook"
      );
      return (
        (!query || haystack.includes(query)) &&
        (!filters.favoritesOnly || recipe.favorite) &&
        (!filters.neverCookedOnly || !lastCooked.get(recipe.id)) &&
        (!filters.quickCookOnly || isQuickCook)
      );
    })
    .sort((left, right) => {
      switch (filters.sort) {
        case "newest":
          return right.createdAt.localeCompare(left.createdAt);
        case "alphabetical":
          return left.title.localeCompare(right.title);
        case "least-recent": {
          const leftDate = lastCooked.get(left.id);
          const rightDate = lastCooked.get(right.id);
          if (!leftDate && rightDate) return -1;
          if (leftDate && !rightDate) return 1;
          if (!leftDate && !rightDate) {
            return left.title.localeCompare(right.title);
          }
          return leftDate!.localeCompare(rightDate!);
        }
      }
    });
}
