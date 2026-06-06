import Fraction from "fraction.js";
import type {
  GroceryAisle,
  IngredientAmount,
  UnitDimension
} from "@/lib/domain/types";

const UNIT_MAP: Record<
  string,
  { unit: string; dimension: UnitDimension; factor: number }
> = {
  "": { unit: "count", dimension: "count", factor: 1 },
  count: { unit: "count", dimension: "count", factor: 1 },
  each: { unit: "count", dimension: "count", factor: 1 },
  item: { unit: "count", dimension: "count", factor: 1 },
  items: { unit: "count", dimension: "count", factor: 1 },
  onion: { unit: "count", dimension: "count", factor: 1 },
  onions: { unit: "count", dimension: "count", factor: 1 },
  clove: { unit: "count", dimension: "count", factor: 1 },
  cloves: { unit: "count", dimension: "count", factor: 1 },
  cup: { unit: "ml", dimension: "volume", factor: 236.588 },
  cups: { unit: "ml", dimension: "volume", factor: 236.588 },
  c: { unit: "ml", dimension: "volume", factor: 236.588 },
  tbsp: { unit: "ml", dimension: "volume", factor: 14.7868 },
  tablespoon: { unit: "ml", dimension: "volume", factor: 14.7868 },
  tablespoons: { unit: "ml", dimension: "volume", factor: 14.7868 },
  tsp: { unit: "ml", dimension: "volume", factor: 4.92892 },
  teaspoon: { unit: "ml", dimension: "volume", factor: 4.92892 },
  teaspoons: { unit: "ml", dimension: "volume", factor: 4.92892 },
  ml: { unit: "ml", dimension: "volume", factor: 1 },
  l: { unit: "ml", dimension: "volume", factor: 1000 },
  liter: { unit: "ml", dimension: "volume", factor: 1000 },
  liters: { unit: "ml", dimension: "volume", factor: 1000 },
  oz: { unit: "g", dimension: "mass", factor: 28.3495 },
  ounce: { unit: "g", dimension: "mass", factor: 28.3495 },
  ounces: { unit: "g", dimension: "mass", factor: 28.3495 },
  lb: { unit: "g", dimension: "mass", factor: 453.592 },
  lbs: { unit: "g", dimension: "mass", factor: 453.592 },
  pound: { unit: "g", dimension: "mass", factor: 453.592 },
  pounds: { unit: "g", dimension: "mass", factor: 453.592 },
  g: { unit: "g", dimension: "mass", factor: 1 },
  gram: { unit: "g", dimension: "mass", factor: 1 },
  grams: { unit: "g", dimension: "mass", factor: 1 },
  kg: { unit: "g", dimension: "mass", factor: 1000 },
  can: { unit: "can", dimension: "package", factor: 1 },
  cans: { unit: "can", dimension: "package", factor: 1 },
  box: { unit: "box", dimension: "package", factor: 1 },
  boxes: { unit: "box", dimension: "package", factor: 1 },
  bag: { unit: "bag", dimension: "package", factor: 1 },
  bags: { unit: "bag", dimension: "package", factor: 1 },
  bottle: { unit: "bottle", dimension: "package", factor: 1 },
  bottles: { unit: "bottle", dimension: "package", factor: 1 },
  carton: { unit: "carton", dimension: "package", factor: 1 },
  cartons: { unit: "carton", dimension: "package", factor: 1 },
  container: { unit: "container", dimension: "package", factor: 1 },
  containers: { unit: "container", dimension: "package", factor: 1 },
  loaf: { unit: "loaf", dimension: "package", factor: 1 },
  loaves: { unit: "loaf", dimension: "package", factor: 1 },
  stick: { unit: "stick", dimension: "package", factor: 1 },
  sticks: { unit: "stick", dimension: "package", factor: 1 },
  slice: { unit: "slice", dimension: "package", factor: 1 },
  slices: { unit: "slice", dimension: "package", factor: 1 },
  packet: { unit: "packet", dimension: "package", factor: 1 },
  packets: { unit: "packet", dimension: "package", factor: 1 },
  package: { unit: "package", dimension: "package", factor: 1 },
  packages: { unit: "package", dimension: "package", factor: 1 },
  bunch: { unit: "bunch", dimension: "package", factor: 1 },
  bunches: { unit: "bunch", dimension: "package", factor: 1 },
  jar: { unit: "jar", dimension: "package", factor: 1 },
  jars: { unit: "jar", dimension: "package", factor: 1 }
};

export interface UnitOption {
  value: string;
  label: string;
  dimension: UnitDimension;
  aliases?: string[];
}

export const UNIT_OPTIONS: UnitOption[] = [
  {
    value: "count",
    label: "each",
    dimension: "count",
    aliases: ["count", "item", "items"]
  },
  {
    value: "tsp",
    label: "tsp",
    dimension: "volume",
    aliases: ["teaspoon", "teaspoons"]
  },
  {
    value: "tbsp",
    label: "tbsp",
    dimension: "volume",
    aliases: ["tablespoon", "tablespoons"]
  },
  {
    value: "cup",
    label: "cup",
    dimension: "volume",
    aliases: ["cups", "c"]
  },
  { value: "ml", label: "ml", dimension: "volume" },
  { value: "l", label: "l", dimension: "volume", aliases: ["liter", "liters"] },
  { value: "oz", label: "oz", dimension: "mass", aliases: ["ounce", "ounces"] },
  {
    value: "lb",
    label: "lb",
    dimension: "mass",
    aliases: ["lbs", "pound", "pounds"]
  },
  { value: "g", label: "g", dimension: "mass", aliases: ["gram", "grams"] },
  { value: "kg", label: "kg", dimension: "mass" },
  { value: "clove", label: "clove", dimension: "count", aliases: ["cloves"] },
  { value: "can", label: "can", dimension: "package", aliases: ["cans"] },
  { value: "box", label: "box", dimension: "package", aliases: ["boxes"] },
  { value: "bag", label: "bag", dimension: "package", aliases: ["bags"] },
  {
    value: "bottle",
    label: "bottle",
    dimension: "package",
    aliases: ["bottles"]
  },
  {
    value: "carton",
    label: "carton",
    dimension: "package",
    aliases: ["cartons"]
  },
  {
    value: "container",
    label: "container",
    dimension: "package",
    aliases: ["containers"]
  },
  { value: "loaf", label: "loaf", dimension: "package", aliases: ["loaves"] },
  { value: "stick", label: "stick", dimension: "package", aliases: ["sticks"] },
  { value: "slice", label: "slice", dimension: "package", aliases: ["slices"] },
  {
    value: "packet",
    label: "packet",
    dimension: "package",
    aliases: ["packets"]
  },
  {
    value: "package",
    label: "package",
    dimension: "package",
    aliases: ["packages"]
  },
  { value: "bunch", label: "bunch", dimension: "package", aliases: ["bunches"] },
  { value: "jar", label: "jar", dimension: "package", aliases: ["jars"] }
];

const PLURAL_UNIT_LABELS: Record<string, string> = {
  cup: "cups",
  clove: "cloves",
  can: "cans",
  box: "boxes",
  bag: "bags",
  bottle: "bottles",
  carton: "cartons",
  container: "containers",
  loaf: "loaves",
  stick: "sticks",
  slice: "slices",
  packet: "packets",
  package: "packages",
  bunch: "bunches",
  jar: "jars"
};

const FRACTION_GLYPHS: Record<string, string> = {
  "½": "1/2",
  "⅓": "1/3",
  "⅔": "2/3",
  "¼": "1/4",
  "¾": "3/4",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8"
};

export function parseQuantity(input: string | number | null): number | null {
  if (input === null || input === "") return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;

  let cleaned = input.trim();
  for (const [glyph, fraction] of Object.entries(FRACTION_GLYPHS)) {
    cleaned = cleaned.replaceAll(glyph, ` ${fraction}`);
  }
  cleaned = cleaned.trim();

  try {
    return new Fraction(cleaned).valueOf();
  } catch {
    const mixed = cleaned.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
    if (mixed) {
      return (
        Number(mixed[1]) +
        Number(mixed[2]) / Math.max(Number(mixed[3]), 1)
      );
    }
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : null;
  }
}

export function normalizeUnit(unit: string): {
  unit: string;
  dimension: UnitDimension;
  factor: number;
} {
  const key = unit.trim().toLowerCase().replace(/\.$/, "");
  return (
    UNIT_MAP[key] ?? {
      unit: key || "count",
      dimension: key ? "package" : "count",
      factor: 1
    }
  );
}

export function resolveUnitInput(unit: string): {
  unit: string;
  dimension: UnitDimension;
} {
  const key = unit.trim().toLowerCase().replace(/\.$/, "");
  if (!key) return { unit: "count", dimension: "count" };
  const option = UNIT_OPTIONS.find((candidate) =>
    [candidate.value, candidate.label, ...(candidate.aliases ?? [])].includes(
      key
    )
  );
  if (option) {
    return { unit: option.value, dimension: option.dimension };
  }
  const normalized = normalizeUnit(key);
  return {
    unit: normalized.unit,
    dimension: normalized.dimension
  };
}

export function unitLabel(unit: string): string {
  const normalized = unit.trim().toLowerCase();
  const option = UNIT_OPTIONS.find((candidate) =>
    [candidate.value, candidate.label, ...(candidate.aliases ?? [])].includes(
      normalized
    )
  );
  if (option) return option.label;
  if (normalizeUnit(normalized).unit === "count") return "each";
  return normalized || "each";
}

function displayUnitLabel(unit: string, quantity: number | null): string {
  const label = unitLabel(unit);
  if (quantity !== null && Math.abs(quantity) > 1) {
    return PLURAL_UNIT_LABELS[label] ?? label;
  }
  return label;
}

export function toBaseQuantity(
  quantity: number | null,
  unit: string
): {
  quantity: number | null;
  unit: string;
  dimension: UnitDimension;
} {
  const normalized = normalizeUnit(unit);
  return {
    quantity: quantity === null ? null : quantity * normalized.factor,
    unit: normalized.unit,
    dimension: normalized.dimension
  };
}

export function canCombine(
  left: Pick<IngredientAmount, "dimension" | "unit">,
  right: Pick<IngredientAmount, "dimension" | "unit">
): boolean {
  if (left.dimension !== right.dimension) return false;
  if (left.dimension === "package") {
    return normalizeUnit(left.unit).unit === normalizeUnit(right.unit).unit;
  }
  return left.dimension !== "qualitative";
}

export function canonicalizeIngredient(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(
      /\b(fresh|finely|roughly|chopped|diced|minced|sliced|shredded|grated|large|medium|small|optional)\b/g,
      ""
    )
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\bonions\b/, "onion")
    .replace(/\btomatoes\b/, "tomato")
    .replace(/\blemons\b/, "lemon")
    .replace(/\blimes\b/, "lime")
    .replace(/\bcloves\b/, "clove");
}

export function formatIngredientAmount(
  ingredient: Pick<IngredientAmount, "quantity" | "unit" | "qualitative">
): string {
  if (ingredient.quantity === null) {
    return ingredient.qualitative ?? "as needed";
  }
  const quantity = formatQuantity(ingredient.quantity);
  const unit =
    resolveUnitInput(ingredient.unit).unit === "count"
      ? ""
      : displayUnitLabel(ingredient.unit, ingredient.quantity);
  return [quantity, unit].filter(Boolean).join(" ");
}

export function formatIngredientLine(
  ingredient: Pick<
    IngredientAmount,
    "name" | "quantity" | "unit" | "qualitative"
  >
): string {
  const amount = formatIngredientAmount(ingredient);
  return amount ? `${amount} ${ingredient.name}` : ingredient.name;
}

export function formatQuantity(quantity: number | null): string {
  if (quantity === null) return "";
  const rounded = Math.round(quantity * 100) / 100;
  const whole = Math.floor(rounded);
  const remainder = rounded - whole;
  const fractions: Array<[number, string]> = [
    [0.125, "1/8"],
    [0.25, "1/4"],
    [0.333, "1/3"],
    [0.5, "1/2"],
    [0.667, "2/3"],
    [0.75, "3/4"]
  ];
  const match = fractions.find(([value]) => Math.abs(remainder - value) < 0.02);
  if (!match) return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
  if (whole === 0) return match[1];
  return `${whole} ${match[1]}`;
}

export function displayUnit(baseUnit: string, quantity: number | null): string {
  if (baseUnit === "count") return quantity === 1 ? "" : "";
  if (baseUnit === "ml" && quantity !== null && quantity >= 236.588) {
    return "cups";
  }
  if (baseUnit === "g" && quantity !== null && quantity >= 453.592) {
    return "lb";
  }
  return baseUnit;
}

export function fromBaseForDisplay(
  quantity: number | null,
  baseUnit: string
): { quantity: number | null; unit: string } {
  if (quantity === null) return { quantity: null, unit: baseUnit };
  if (baseUnit === "ml" && quantity >= 236.588) {
    return { quantity: quantity / 236.588, unit: "cups" };
  }
  if (baseUnit === "g" && quantity >= 453.592) {
    return { quantity: quantity / 453.592, unit: "lb" };
  }
  return { quantity, unit: baseUnit };
}

const PRODUCE = [
  "onion",
  "garlic",
  "tomato",
  "pepper",
  "lemon",
  "lime",
  "cilantro",
  "parsley",
  "potato",
  "broccoli",
  "spinach",
  "avocado"
];
const DAIRY = ["milk", "cream", "cheese", "butter", "yogurt", "egg"];
const MEAT = ["chicken", "beef", "pork", "turkey", "sausage", "salmon"];
const BAKERY = ["bread", "bun", "tortilla", "pita"];
const FROZEN = ["frozen"];

export function inferAisle(name: string): GroceryAisle {
  const canonical = canonicalizeIngredient(name);
  if (PRODUCE.some((item) => canonical.includes(item))) return "Produce";
  if (DAIRY.some((item) => canonical.includes(item))) return "Dairy";
  if (MEAT.some((item) => canonical.includes(item))) return "Meat";
  if (BAKERY.some((item) => canonical.includes(item))) return "Bakery";
  if (FROZEN.some((item) => canonical.includes(item))) return "Frozen";
  return "Pantry";
}

export function createIngredient(
  id: string,
  name: string,
  quantity: number | null,
  unit: string,
  preparation?: string
): IngredientAmount {
  const resolved = resolveUnitInput(unit);
  const normalized = normalizeUnit(resolved.unit);
  return {
    id,
    name,
    canonicalName: canonicalizeIngredient(name),
    quantity,
    unit: resolved.unit,
    dimension: normalized.dimension,
    preparation,
    aisle: inferAisle(name)
  };
}
