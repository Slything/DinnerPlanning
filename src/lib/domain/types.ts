export type ID = string;

export type UnitDimension =
  | "count"
  | "mass"
  | "volume"
  | "package"
  | "qualitative";

export type GroceryAisle =
  | "Produce"
  | "Meat"
  | "Dairy"
  | "Bakery"
  | "Pantry"
  | "Frozen"
  | "Other";

export interface Household {
  id: ID;
  name: string;
  defaultServings: number;
  weekStartsOn: 0 | 1;
  aiModelId?: string;
}

export interface HouseholdMember {
  id: ID;
  householdId: ID;
  email: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
}

export interface IngredientAmount {
  id: ID;
  catalogId?: ID;
  saveToCatalog?: boolean;
  name: string;
  canonicalName: string;
  quantity: number | null;
  unit: string;
  dimension: UnitDimension;
  preparation?: string;
  qualitative?: "little" | "some" | "lot" | "as-needed";
  aisle: GroceryAisle;
  optional?: boolean;
  aliases?: string[];
}

export interface IngredientCatalogEntry {
  id: ID;
  householdId: ID;
  canonicalName: string;
  displayName: string;
  defaultUnit: string;
  dimension: UnitDimension;
  aisle: GroceryAisle;
  aliases: string[];
  usageCount: number;
  lastUsedAt: string;
}

export type RecipeSortMode =
  | "least-recent"
  | "newest"
  | "alphabetical";

export type RecipeVisibility = "private" | "public";
export type RecipeSourceType = "household" | "public-owned" | "saved-copy";

export interface RecipeVersion {
  id: ID;
  recipeId: ID;
  version: number;
  createdAt: string;
  createdBy: ID;
  note: string;
  yield: number;
  ingredients: IngredientAmount[];
  instructions: string[];
}

export interface Recipe {
  id: ID;
  householdId: ID;
  title: string;
  description: string;
  sourceUrl?: string;
  sourceCreator?: string;
  imageUrl?: string;
  prepMinutes: number;
  cookMinutes: number;
  tags: string[];
  favorite: boolean;
  visibility: RecipeVisibility;
  publishedVersion?: number;
  attributionHousehold?: string;
  sourceType?: RecipeSourceType;
  sourceLabel?: string;
  updateAvailable?: boolean;
  currentVersion: number;
  versions: RecipeVersion[];
  createdAt: string;
}

export interface RecipeShare {
  id: ID;
  sourceRecipeId: ID;
  sourceHouseholdId: ID;
  recipientEmail?: string;
  recipientHouseholdId?: ID;
  kind: "public" | "private";
  active: boolean;
  createdAt: string;
  acceptedAt?: string;
}

export interface RecipeShareRevision {
  id: ID;
  shareId: ID;
  sourceRecipeId: ID;
  sourceVersion: number;
  snapshot: SharedRecipeSnapshot;
  createdAt: string;
}

export interface RecipeCopyOrigin {
  id: ID;
  recipeId: ID;
  sourceRecipeId: ID;
  shareId?: ID;
  lastAppliedRevisionId?: ID;
  updatesEnabled: boolean;
}

export interface SharedRecipeSnapshot {
  title: string;
  description: string;
  sourceUrl?: string;
  sourceCreator?: string;
  imageUrl?: string;
  prepMinutes: number;
  cookMinutes: number;
  tags: string[];
  yield: number;
  ingredients: IngredientAmount[];
  instructions: string[];
  attributionHousehold: string;
}

export interface AiModelOption {
  id: string;
  name: string;
  contextLength: number;
  supportsImages: boolean;
  supportsStructuredOutput: boolean;
  promptPrice?: string;
  completionPrice?: string;
}

export interface RecipeDraft {
  title: string;
  description: string;
  sourceUrl?: string;
  sourceCreator?: string;
  yield: number;
  prepMinutes: number;
  cookMinutes: number;
  tags: string[];
  ingredients: IngredientAmount[];
  instructions: string[];
  warnings: string[];
  confidence: "low" | "medium" | "high";
}

export type MealKind = "recipe" | "leftovers" | "dining-out";

export interface PlannedMeal {
  id: ID;
  householdId: ID;
  date: string;
  kind: MealKind;
  recipeId?: ID;
  servings: number;
  cookedAt?: string;
}

export interface WeeklyPlan {
  id: ID;
  householdId: ID;
  weekStart: string;
  meals: PlannedMeal[];
  updatedAt: string;
}

export interface PantryItem {
  id: ID;
  householdId: ID;
  name: string;
  canonicalName: string;
  quantity: number | null;
  unit: string;
  dimension: UnitDimension;
  aisle: GroceryAisle;
  needsConfirmation: boolean;
  updatedAt: string;
}

export type PantryTransactionKind =
  | "manual"
  | "cooking"
  | "restock"
  | "correction";

export interface PantryTransaction {
  id: ID;
  pantryItemId: ID;
  householdId: ID;
  kind: PantryTransactionKind;
  quantityDelta: number | null;
  unit: string;
  note: string;
  createdAt: string;
  createdBy: ID;
}

export interface PantryAllocation {
  id: ID;
  householdId: ID;
  plannedMealId: ID;
  pantryItemId: ID;
  quantity: number | null;
  unit: string;
  createdAt: string;
}

export type AdjustmentIntent = "actual" | "next-time";
export type AdjustmentKind = "more" | "less" | "skipped" | "new";

export interface CookingAdjustment {
  id: ID;
  ingredientId?: ID;
  name: string;
  canonicalName: string;
  intent: AdjustmentIntent;
  kind: AdjustmentKind;
  quantity: number | null;
  unit: string;
  dimension: UnitDimension;
  qualitative?: IngredientAmount["qualitative"];
  aisle: GroceryAisle;
  note?: string;
}

export interface IngredientUsage {
  id: ID;
  cookingSessionId: ID;
  ingredientId?: ID;
  name: string;
  canonicalName: string;
  quantity: number | null;
  unit: string;
  dimension: UnitDimension;
  approximate: boolean;
}

export interface CookingSession {
  id: ID;
  householdId: ID;
  plannedMealId: ID;
  recipeId: ID;
  recipeVersion: number;
  servings: number;
  cookedAt: string;
  cookedBy: ID;
  notes: string;
  adjustments: CookingAdjustment[];
  usage: IngredientUsage[];
}

export type ProposalStatus = "pending" | "approved" | "ignored";

export interface RecipeChangeProposal {
  id: ID;
  householdId: ID;
  cookingSessionId: ID;
  recipeId: ID;
  basedOnVersion: number;
  status: ProposalStatus;
  proposedIngredients: IngredientAmount[];
  note: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: ID;
}

export interface ShoppingListSource {
  plannedMealId: ID;
  recipeId: ID;
  ingredientId: ID;
  scaledQuantity: number | null;
}

export interface ShoppingListItem {
  id: ID;
  shoppingListId: ID;
  name: string;
  canonicalName: string;
  quantity: number | null;
  unit: string;
  dimension: UnitDimension;
  aisle: GroceryAisle;
  checked: boolean;
  manual: boolean;
  qualitative?: IngredientAmount["qualitative"];
  sources: ShoppingListSource[];
  updatedAt: string;
}

export interface ShoppingList {
  id: ID;
  householdId: ID;
  weeklyPlanId: ID;
  generatedAt: string;
  updatedAt: string;
  stale: boolean;
  completedAt?: string;
  items: ShoppingListItem[];
}

export interface PantryReviewLine {
  canonicalName: string;
  name: string;
  requiredQuantity: number | null;
  availableQuantity: number | null;
  allocatedQuantity: number | null;
  unit: string;
  dimension: UnitDimension;
  aisle: GroceryAisle;
  unresolved: boolean;
}

export interface AppState {
  household: Household;
  members: HouseholdMember[];
  currentMemberId: ID;
  recipes: Recipe[];
  ingredientCatalog: IngredientCatalogEntry[];
  weeklyPlan: WeeklyPlan;
  pantry: PantryItem[];
  pantryTransactions: PantryTransaction[];
  allocations: PantryAllocation[];
  shoppingList: ShoppingList | null;
  cookingSessions: CookingSession[];
  proposals: RecipeChangeProposal[];
  recipeOrigins: RecipeCopyOrigin[];
}
