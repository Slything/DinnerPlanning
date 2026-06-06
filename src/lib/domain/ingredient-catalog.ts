import type {
  GroceryAisle,
  IngredientCatalogEntry,
  UnitDimension
} from "@/lib/domain/types";
import { canonicalizeIngredient } from "@/lib/domain/quantities";

export type IngredientSuggestionSource = "household" | "starter";

export interface IngredientSuggestion {
  id: string;
  source: IngredientSuggestionSource;
  canonicalName: string;
  displayName: string;
  defaultUnit: string;
  dimension: UnitDimension;
  aisle: GroceryAisle;
  aliases: string[];
  usageCount: number;
  lastUsedAt: string;
}

type StarterIngredient = Omit<
  IngredientSuggestion,
  "id" | "source" | "usageCount" | "lastUsedAt"
>;

const STARTER_INGREDIENTS: StarterIngredient[] = [
  { displayName: "Yellow onion", canonicalName: "yellow onion", defaultUnit: "count", dimension: "count", aisle: "Produce", aliases: ["onion"] },
  { displayName: "Garlic", canonicalName: "garlic", defaultUnit: "clove", dimension: "count", aisle: "Produce", aliases: ["garlic cloves"] },
  { displayName: "Tomato", canonicalName: "tomato", defaultUnit: "count", dimension: "count", aisle: "Produce", aliases: ["tomatoes"] },
  { displayName: "Bell pepper", canonicalName: "bell pepper", defaultUnit: "count", dimension: "count", aisle: "Produce", aliases: ["pepper"] },
  { displayName: "Potato", canonicalName: "potato", defaultUnit: "count", dimension: "count", aisle: "Produce", aliases: ["potatoes"] },
  { displayName: "Carrot", canonicalName: "carrot", defaultUnit: "count", dimension: "count", aisle: "Produce", aliases: ["carrots"] },
  { displayName: "Broccoli", canonicalName: "broccoli", defaultUnit: "count", dimension: "count", aisle: "Produce", aliases: [] },
  { displayName: "Spinach", canonicalName: "spinach", defaultUnit: "oz", dimension: "mass", aisle: "Produce", aliases: [] },
  { displayName: "Lemon", canonicalName: "lemon", defaultUnit: "count", dimension: "count", aisle: "Produce", aliases: ["lemons"] },
  { displayName: "Lime", canonicalName: "lime", defaultUnit: "count", dimension: "count", aisle: "Produce", aliases: ["limes"] },
  { displayName: "Cilantro", canonicalName: "cilantro", defaultUnit: "bunch", dimension: "package", aisle: "Produce", aliases: [] },
  { displayName: "Parsley", canonicalName: "parsley", defaultUnit: "bunch", dimension: "package", aisle: "Produce", aliases: [] },
  { displayName: "Chicken breast", canonicalName: "chicken breast", defaultUnit: "lb", dimension: "mass", aisle: "Meat", aliases: ["chicken"] },
  { displayName: "Ground beef", canonicalName: "ground beef", defaultUnit: "lb", dimension: "mass", aisle: "Meat", aliases: ["beef"] },
  { displayName: "Pork chops", canonicalName: "pork chops", defaultUnit: "lb", dimension: "mass", aisle: "Meat", aliases: ["pork"] },
  { displayName: "Turkey", canonicalName: "turkey", defaultUnit: "lb", dimension: "mass", aisle: "Meat", aliases: [] },
  { displayName: "Salmon", canonicalName: "salmon", defaultUnit: "lb", dimension: "mass", aisle: "Meat", aliases: [] },
  { displayName: "Eggs", canonicalName: "egg", defaultUnit: "count", dimension: "count", aisle: "Dairy", aliases: ["egg"] },
  { displayName: "Milk", canonicalName: "milk", defaultUnit: "cup", dimension: "volume", aisle: "Dairy", aliases: [] },
  { displayName: "Butter", canonicalName: "butter", defaultUnit: "tbsp", dimension: "volume", aisle: "Dairy", aliases: [] },
  { displayName: "Cheddar cheese", canonicalName: "cheddar cheese", defaultUnit: "oz", dimension: "mass", aisle: "Dairy", aliases: ["cheese"] },
  { displayName: "Heavy cream", canonicalName: "heavy cream", defaultUnit: "cup", dimension: "volume", aisle: "Dairy", aliases: ["cream"] },
  { displayName: "Greek yogurt", canonicalName: "greek yogurt", defaultUnit: "cup", dimension: "volume", aisle: "Dairy", aliases: ["yogurt"] },
  { displayName: "Bread", canonicalName: "bread", defaultUnit: "package", dimension: "package", aisle: "Bakery", aliases: [] },
  { displayName: "Tortillas", canonicalName: "tortilla", defaultUnit: "package", dimension: "package", aisle: "Bakery", aliases: ["tortilla"] },
  { displayName: "Pasta", canonicalName: "pasta", defaultUnit: "oz", dimension: "mass", aisle: "Pantry", aliases: [] },
  { displayName: "Rice", canonicalName: "rice", defaultUnit: "cup", dimension: "volume", aisle: "Pantry", aliases: [] },
  { displayName: "Black beans", canonicalName: "black beans", defaultUnit: "can", dimension: "package", aisle: "Pantry", aliases: ["beans"] },
  { displayName: "Tomato sauce", canonicalName: "tomato sauce", defaultUnit: "can", dimension: "package", aisle: "Pantry", aliases: [] },
  { displayName: "Chicken broth", canonicalName: "chicken broth", defaultUnit: "cup", dimension: "volume", aisle: "Pantry", aliases: ["broth"] },
  { displayName: "Olive oil", canonicalName: "olive oil", defaultUnit: "tbsp", dimension: "volume", aisle: "Pantry", aliases: ["oil"] },
  { displayName: "Salt", canonicalName: "salt", defaultUnit: "tsp", dimension: "volume", aisle: "Pantry", aliases: [] },
  { displayName: "Black pepper", canonicalName: "black pepper", defaultUnit: "tsp", dimension: "volume", aisle: "Pantry", aliases: ["pepper"] },
  { displayName: "Paprika", canonicalName: "paprika", defaultUnit: "tsp", dimension: "volume", aisle: "Pantry", aliases: [] },
  { displayName: "Cumin", canonicalName: "cumin", defaultUnit: "tsp", dimension: "volume", aisle: "Pantry", aliases: [] },
  { displayName: "Chili powder", canonicalName: "chili powder", defaultUnit: "tsp", dimension: "volume", aisle: "Pantry", aliases: [] },
  { displayName: "Frozen peas", canonicalName: "frozen peas", defaultUnit: "cup", dimension: "volume", aisle: "Frozen", aliases: ["peas"] },
  { displayName: "Frozen corn", canonicalName: "frozen corn", defaultUnit: "cup", dimension: "volume", aisle: "Frozen", aliases: ["corn"] }
];

const STARTER_DATE = "1970-01-01T00:00:00.000Z";

export function starterIngredientCatalog(): IngredientSuggestion[] {
  return STARTER_INGREDIENTS.map((entry) => ({
    ...entry,
    id: `starter-${entry.canonicalName.replace(/\s+/g, "-")}`,
    source: "starter",
    usageCount: 0,
    lastUsedAt: STARTER_DATE
  }));
}

export function householdCatalogSuggestions(
  catalog: IngredientCatalogEntry[]
): IngredientSuggestion[] {
  return catalog.map((entry) => ({
    id: entry.id,
    source: "household",
    canonicalName: entry.canonicalName,
    displayName: entry.displayName,
    defaultUnit: entry.defaultUnit,
    dimension: entry.dimension,
    aisle: entry.aisle,
    aliases: entry.aliases,
    usageCount: entry.usageCount,
    lastUsedAt: entry.lastUsedAt
  }));
}

export function mergedIngredientCatalog(
  catalog: IngredientCatalogEntry[]
): IngredientSuggestion[] {
  const merged = new Map<string, IngredientSuggestion>();
  for (const entry of starterIngredientCatalog()) {
    merged.set(entry.canonicalName, entry);
  }
  for (const entry of householdCatalogSuggestions(catalog)) {
    merged.set(entry.canonicalName, entry);
  }
  return [...merged.values()];
}

export function findIngredientSuggestion(
  suggestions: IngredientSuggestion[],
  name: string
): IngredientSuggestion | undefined {
  const normalized = name.trim().toLowerCase();
  const canonical = canonicalizeIngredient(name);
  return suggestions.find(
    (entry) =>
      entry.displayName.toLowerCase() === normalized ||
      entry.canonicalName === canonical ||
      entry.aliases.some((alias) => alias.toLowerCase() === normalized)
  );
}

export function searchIngredientSuggestions(
  suggestions: IngredientSuggestion[],
  query: string,
  limit = 8
): IngredientSuggestion[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return suggestions
    .filter((entry) =>
      [entry.displayName, entry.canonicalName, ...entry.aliases].some((value) =>
        value.toLowerCase().includes(normalized)
      )
    )
    .sort((left, right) => {
      const leftStarts = left.displayName.toLowerCase().startsWith(normalized);
      const rightStarts = right.displayName.toLowerCase().startsWith(normalized);
      if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
      if (left.source !== right.source) {
        return left.source === "household" ? -1 : 1;
      }
      return (
        right.usageCount - left.usageCount ||
        right.lastUsedAt.localeCompare(left.lastUsedAt) ||
        left.displayName.localeCompare(right.displayName)
      );
    })
    .slice(0, limit);
}
