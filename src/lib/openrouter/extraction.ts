import {
  importedRecipeSchema,
  type ImportedRecipe
} from "@/lib/import/recipe-schema";

export function parseOpenRouterRecipeContent(content: string): ImportedRecipe {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenRouter returned malformed JSON.");
  }
  return importedRecipeSchema.parse(parsed);
}
