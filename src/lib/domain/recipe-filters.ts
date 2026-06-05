import type {
  CookingSession,
  Recipe,
  RecipeSortMode
} from "@/lib/domain/types";

export interface RecipeFilters {
  query: string;
  favoritesOnly: boolean;
  neverCookedOnly: boolean;
  maxMinutes: number | null;
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
      const totalMinutes = recipe.prepMinutes + recipe.cookMinutes;
      return (
        (!query || haystack.includes(query)) &&
        (!filters.favoritesOnly || recipe.favorite) &&
        (!filters.neverCookedOnly || !lastCooked.get(recipe.id)) &&
        (filters.maxMinutes === null || totalMinutes <= filters.maxMinutes)
      );
    })
    .sort((left, right) => {
      const leftMinutes = left.prepMinutes + left.cookMinutes;
      const rightMinutes = right.prepMinutes + right.cookMinutes;
      switch (filters.sort) {
        case "fastest":
          return leftMinutes - rightMinutes || left.title.localeCompare(right.title);
        case "slowest":
          return rightMinutes - leftMinutes || left.title.localeCompare(right.title);
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

export function searchIngredientCatalog<T extends {
  displayName: string;
  canonicalName: string;
  aliases: string[];
  usageCount: number;
  lastUsedAt: string;
}>(catalog: T[], query: string, limit = 8): T[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return catalog
    .filter((entry) =>
      [entry.displayName, entry.canonicalName, ...entry.aliases].some((value) =>
        value.toLowerCase().includes(normalized)
      )
    )
    .sort((left, right) => {
      const leftStarts = left.displayName.toLowerCase().startsWith(normalized);
      const rightStarts = right.displayName.toLowerCase().startsWith(normalized);
      if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
      return (
        right.usageCount - left.usageCount ||
        right.lastUsedAt.localeCompare(left.lastUsedAt)
      );
    })
    .slice(0, limit);
}

