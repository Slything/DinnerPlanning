import type { Recipe } from "@/lib/domain/types";

export const QUICK_COOK_LABEL = "Quick Cook";

export function recipeTagsForSave(quickCook: boolean): string[] {
  return quickCook ? [QUICK_COOK_LABEL] : [];
}

export function visibleRecipeTags(tags: string[]): string[] {
  return tags.some((tag) => tag.trim().toLowerCase() === "quick cook")
    ? [QUICK_COOK_LABEL]
    : [];
}

export function recipeLabels(recipe: Pick<Recipe, "tags">): string[] {
  return visibleRecipeTags(recipe.tags);
}

export function isQuickCookRecipe(recipe: Pick<Recipe, "tags">): boolean {
  return visibleRecipeTags(recipe.tags).length > 0;
}

export function recipeSourceType(
  recipe: Pick<Recipe, "attributionHousehold" | "visibility" | "sourceType">
): NonNullable<Recipe["sourceType"]> {
  if (recipe.sourceType) return recipe.sourceType;
  if (recipe.attributionHousehold) return "saved-copy";
  return recipe.visibility === "public" ? "public-owned" : "household";
}

export function recipeSourceLabel(
  recipe: Pick<
    Recipe,
    "attributionHousehold" | "visibility" | "sourceLabel" | "sourceType"
  >
): string | undefined {
  if (recipe.sourceLabel) return recipe.sourceLabel;
  if (recipeSourceType(recipe) === "saved-copy") {
    return `Saved from ${recipe.attributionHousehold ?? "another household"}`;
  }
  if (recipeSourceType(recipe) === "public-owned") return "Public";
  return undefined;
}
