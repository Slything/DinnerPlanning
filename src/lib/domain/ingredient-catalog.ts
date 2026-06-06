import type {
  GroceryAisle,
  IngredientCatalogEntry,
  UnitDimension
} from "@/lib/domain/types";
import {
  canonicalizeIngredient,
  inferAisle
} from "@/lib/domain/quantities";

export type IngredientSuggestionSource = "household" | "starter" | "custom";

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

export interface ResolvedIngredientInput {
  suggestion?: IngredientSuggestion;
  displayName: string;
  canonicalName: string;
  defaultUnit: string;
  dimension: UnitDimension;
  aisle: GroceryAisle;
  aliases: string[];
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
  { displayName: "Garlic bread", canonicalName: "garlic bread", defaultUnit: "loaf", dimension: "package", aisle: "Frozen", aliases: ["gralic bread"] },
  { displayName: "Tortillas", canonicalName: "tortilla", defaultUnit: "package", dimension: "package", aisle: "Bakery", aliases: ["tortilla"] },
  { displayName: "Pasta", canonicalName: "pasta", defaultUnit: "box", dimension: "package", aisle: "Pantry", aliases: ["boxed pasta"] },
  { displayName: "Spaghetti", canonicalName: "spaghetti", defaultUnit: "box", dimension: "package", aisle: "Pantry", aliases: ["spaghetti noodles"] },
  { displayName: "Penne pasta", canonicalName: "penne pasta", defaultUnit: "box", dimension: "package", aisle: "Pantry", aliases: ["penne"] },
  { displayName: "Macaroni", canonicalName: "macaroni", defaultUnit: "box", dimension: "package", aisle: "Pantry", aliases: ["elbow macaroni"] },
  { displayName: "Lasagna noodles", canonicalName: "lasagna noodles", defaultUnit: "box", dimension: "package", aisle: "Pantry", aliases: ["lasagna pasta"] },
  { displayName: "Rice", canonicalName: "rice", defaultUnit: "cup", dimension: "volume", aisle: "Pantry", aliases: [] },
  { displayName: "Black beans", canonicalName: "black beans", defaultUnit: "can", dimension: "package", aisle: "Pantry", aliases: ["beans"] },
  { displayName: "Tomato sauce", canonicalName: "tomato sauce", defaultUnit: "can", dimension: "package", aisle: "Pantry", aliases: [] },
  { displayName: "Pasta sauce", canonicalName: "pasta sauce", defaultUnit: "jar", dimension: "package", aisle: "Pantry", aliases: ["marinara sauce", "spaghetti sauce"] },
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
const INGREDIENT_WORD_FIXES: Record<string, string> = {
  gralic: "garlic"
};

function cleanIngredientText(input: string): string {
  return input
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function addAlias(aliases: string[], value: string): string[] {
  const cleaned = cleanIngredientText(value);
  if (!cleaned) return aliases;
  if (
    aliases.some((alias) => alias.toLowerCase() === cleaned.toLowerCase())
  ) {
    return aliases;
  }
  return [...aliases, cleaned];
}

function candidateValues(entry: IngredientSuggestion): string[] {
  return [entry.displayName, entry.canonicalName, ...entry.aliases];
}

function damerauLevenshtein(left: string, right: string): number {
  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0)
  );
  for (let index = 0; index <= left.length; index += 1) {
    matrix[index][0] = index;
  }
  for (let index = 0; index <= right.length; index += 1) {
    matrix[0][index] = index;
  }
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      matrix[leftIndex][rightIndex] = Math.min(
        matrix[leftIndex - 1][rightIndex] + 1,
        matrix[leftIndex][rightIndex - 1] + 1,
        matrix[leftIndex - 1][rightIndex - 1] + cost
      );
      if (
        leftIndex > 1 &&
        rightIndex > 1 &&
        left[leftIndex - 1] === right[rightIndex - 2] &&
        left[leftIndex - 2] === right[rightIndex - 1]
      ) {
        matrix[leftIndex][rightIndex] = Math.min(
          matrix[leftIndex][rightIndex],
          matrix[leftIndex - 2][rightIndex - 2] + cost
        );
      }
    }
  }
  return matrix[left.length][right.length];
}

function sortSuggestions(
  left: IngredientSuggestion,
  right: IngredientSuggestion
): number {
  if (left.source !== right.source) {
    return left.source === "household" ? -1 : 1;
  }
  return (
    right.usageCount - left.usageCount ||
    right.lastUsedAt.localeCompare(left.lastUsedAt) ||
    left.displayName.localeCompare(right.displayName)
  );
}

export function normalizeIngredientDisplayName(input: string): string {
  const cleaned = cleanIngredientText(input);
  if (!cleaned) return "";
  const corrected = cleaned
    .toLowerCase()
    .split(" ")
    .map((word) => INGREDIENT_WORD_FIXES[word] ?? word)
    .join(" ");
  return corrected.charAt(0).toUpperCase() + corrected.slice(1);
}

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
  const displayName = normalizeIngredientDisplayName(name);
  const normalized = displayName.toLowerCase();
  const canonical = canonicalizeIngredient(displayName);
  return suggestions.find(
    (entry) =>
      entry.displayName.toLowerCase() === normalized ||
      entry.canonicalName === canonical ||
      entry.aliases.some(
        (alias) =>
          normalizeIngredientDisplayName(alias).toLowerCase() === normalized
      )
  );
}

export function resolveIngredientInput(
  input: string,
  suggestions: IngredientSuggestion[]
): ResolvedIngredientInput {
  const raw = cleanIngredientText(input);
  const displayName = normalizeIngredientDisplayName(raw);
  const exact = findIngredientSuggestion(suggestions, raw);
  const canonical = canonicalizeIngredient(displayName);
  const fuzzy =
    exact ??
    suggestions
      .filter((entry) =>
        candidateValues(entry).some(
          (value) =>
            damerauLevenshtein(canonical, canonicalizeIngredient(value)) <= 1
        )
      )
      .sort(sortSuggestions)[0];
  const suggestion = exact ?? fuzzy;
  const resolvedDisplayName = suggestion?.displayName ?? displayName;
  const aliases = [raw, displayName].reduce(addAlias, [] as string[]).filter(
    (alias) =>
      alias.toLowerCase() !== resolvedDisplayName.toLowerCase() &&
      alias.toLowerCase() !== (suggestion?.canonicalName ?? canonical)
  );

  if (suggestion) {
    return {
      suggestion,
      displayName: suggestion.displayName,
      canonicalName: suggestion.canonicalName,
      defaultUnit: suggestion.defaultUnit,
      dimension: suggestion.dimension,
      aisle: suggestion.aisle,
      aliases
    };
  }

  return {
    displayName,
    canonicalName: canonical,
    defaultUnit: "count",
    dimension: "count",
    aisle: inferAisle(displayName),
    aliases
  };
}

export function searchIngredientSuggestions(
  suggestions: IngredientSuggestion[],
  query: string,
  limit = 8
): IngredientSuggestion[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const displayQuery = normalizeIngredientDisplayName(query);
  const canonicalQuery = canonicalizeIngredient(displayQuery);
  return suggestions
    .filter((entry) =>
      candidateValues(entry).some((value) => {
        const candidate = value.toLowerCase();
        const candidateCanonical = canonicalizeIngredient(value);
        return (
          candidate.includes(normalized) ||
          candidateCanonical.includes(canonicalQuery) ||
          damerauLevenshtein(canonicalQuery, candidateCanonical) <= 1
        );
      })
    )
    .sort((left, right) => {
      const leftStarts = left.displayName.toLowerCase().startsWith(normalized);
      const rightStarts = right.displayName.toLowerCase().startsWith(normalized);
      if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
      return sortSuggestions(left, right);
    })
    .slice(0, limit);
}
