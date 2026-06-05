"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type {
  AppState,
  CookingAdjustment,
  IngredientAmount,
  PantryItem,
  PlannedMeal,
  Recipe,
  RecipeChangeProposal,
  ShoppingListItem
} from "@/lib/domain/types";
import {
  canonicalizeIngredient,
  inferAisle,
  normalizeUnit,
  toBaseQuantity
} from "@/lib/domain/quantities";
import { markMealCooked } from "@/lib/domain/cooking";
import { generateShoppingList } from "@/lib/domain/shopping";
import { createDemoState } from "@/lib/demo/seed";
import {
  queueShoppingMutation,
  saveActiveShoppingList,
  syncShoppingMutations
} from "@/lib/offline/shopping-queue";

const STORAGE_KEY = "gather-and-graze-demo-v1";

interface PantryInput {
  id?: string;
  name: string;
  quantity: number | null;
  unit: string;
  needsConfirmation?: boolean;
}

interface DemoStore {
  state: AppState;
  loaded: boolean;
  scheduleRecipe: (date: string, recipeId: string, servings: number) => void;
  scheduleSpecial: (
    date: string,
    kind: PlannedMeal["kind"],
    servings?: number
  ) => void;
  removeMeal: (mealId: string) => void;
  addRecipe: (
    recipe: Omit<
      Recipe,
      "id" | "householdId" | "createdAt" | "currentVersion" | "versions"
    > & {
      yield: number;
      ingredients: IngredientAmount[];
      instructions: string[];
    }
  ) => void;
  toggleFavorite: (recipeId: string) => void;
  upsertPantryItem: (input: PantryInput) => void;
  removePantryItem: (id: string) => void;
  generateList: () => void;
  toggleShoppingItem: (id: string) => void;
  addShoppingItem: (name: string) => void;
  markListStale: () => void;
  completeShopping: (itemIds: string[]) => void;
  cookMeal: (
    mealId: string,
    notes: string,
    adjustments: CookingAdjustment[]
  ) => RecipeChangeProposal | null;
  reviewProposal: (
    proposalId: string,
    status: "approved" | "ignored",
    ingredients?: IngredientAmount[]
  ) => { ok: boolean; message?: string };
  switchMember: (memberId: string) => void;
  resetDemo: () => void;
}

const DemoStoreContext = createContext<DemoStore | null>(null);

function localId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function initialState(): AppState {
  return createDemoState();
}

export function DemoStoreProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<AppState>(initialState);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setState(JSON.parse(saved) as AppState);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [loaded, state]);

  useEffect(() => {
    if (!loaded) return;
    void saveActiveShoppingList(state.shoppingList);
  }, [loaded, state.shoppingList]);

  useEffect(() => {
    if (!loaded) return;
    const sync = () => {
      void syncShoppingMutations().catch(() => {
        // Queued mutations remain in IndexedDB for the next reconnect.
      });
    };
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    sync();
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
    };
  }, [loaded]);

  const scheduleRecipe = useCallback(
    (date: string, recipeId: string, servings: number) => {
      setState((current) => {
        const existing = current.weeklyPlan.meals.find(
          (meal) => meal.date === date
        );
        const nextMeal: PlannedMeal = {
          id: existing?.id ?? localId("meal"),
          householdId: current.household.id,
          date,
          kind: "recipe",
          recipeId,
          servings
        };
        return {
          ...current,
          weeklyPlan: {
            ...current.weeklyPlan,
            meals: [
              ...current.weeklyPlan.meals.filter(
                (meal) => meal.date !== date
              ),
              nextMeal
            ],
            updatedAt: new Date().toISOString()
          },
          shoppingList: current.shoppingList
            ? { ...current.shoppingList, stale: true }
            : null
        };
      });
    },
    []
  );

  const scheduleSpecial = useCallback(
    (date: string, kind: PlannedMeal["kind"], servings = 4) => {
      setState((current) => ({
        ...current,
        weeklyPlan: {
          ...current.weeklyPlan,
          meals: [
            ...current.weeklyPlan.meals.filter((meal) => meal.date !== date),
            {
              id:
                current.weeklyPlan.meals.find((meal) => meal.date === date)
                  ?.id ?? localId("meal"),
              householdId: current.household.id,
              date,
              kind,
              servings
            }
          ],
          updatedAt: new Date().toISOString()
        },
        shoppingList: current.shoppingList
          ? { ...current.shoppingList, stale: true }
          : null
      }));
    },
    []
  );

  const removeMeal = useCallback((mealId: string) => {
    setState((current) => ({
      ...current,
      weeklyPlan: {
        ...current.weeklyPlan,
        meals: current.weeklyPlan.meals.filter((meal) => meal.id !== mealId),
        updatedAt: new Date().toISOString()
      },
      shoppingList: current.shoppingList
        ? { ...current.shoppingList, stale: true }
        : null
    }));
  }, []);

  const addRecipe: DemoStore["addRecipe"] = useCallback((input) => {
    setState((current) => {
      const recipeId = localId("recipe");
      const now = new Date().toISOString();
      const {
        yield: yieldCount,
        ingredients,
        instructions,
        ...recipeFields
      } = input;
      const recipe: Recipe = {
        ...recipeFields,
        id: recipeId,
        householdId: current.household.id,
        createdAt: now,
        currentVersion: 1,
        versions: [
          {
            id: localId("recipe-version"),
            recipeId,
            version: 1,
            createdAt: now,
            createdBy: current.currentMemberId,
            note: "Original household recipe",
            yield: yieldCount,
            ingredients,
            instructions
          }
        ]
      };
      return { ...current, recipes: [recipe, ...current.recipes] };
    });
  }, []);

  const toggleFavorite = useCallback((recipeId: string) => {
    setState((current) => ({
      ...current,
      recipes: current.recipes.map((recipe) =>
        recipe.id === recipeId
          ? { ...recipe, favorite: !recipe.favorite }
          : recipe
      )
    }));
  }, []);

  const upsertPantryItem = useCallback((input: PantryInput) => {
    setState((current) => {
      const normalized = normalizeUnit(input.unit);
      const existing = input.id
        ? current.pantry.find((item) => item.id === input.id)
        : current.pantry.find(
            (item) =>
              item.canonicalName === canonicalizeIngredient(input.name) &&
              item.dimension === normalized.dimension
          );
      const now = new Date().toISOString();
      const item: PantryItem = {
        id: existing?.id ?? localId("pantry"),
        householdId: current.household.id,
        name: input.name,
        canonicalName: canonicalizeIngredient(input.name),
        quantity: input.quantity,
        unit: input.unit || "count",
        dimension: normalized.dimension,
        aisle: existing?.aisle ?? inferAisle(input.name),
        needsConfirmation: input.needsConfirmation ?? false,
        updatedAt: now
      };
      return {
        ...current,
        pantry: [
          item,
          ...current.pantry.filter((candidate) => candidate.id !== item.id)
        ],
        pantryTransactions: [
          {
            id: localId("pantry-tx"),
            pantryItemId: item.id,
            householdId: current.household.id,
            kind: existing ? "correction" : "manual",
            quantityDelta: input.quantity,
            unit: item.unit,
            note: existing ? "Pantry quantity updated" : "Added to pantry",
            createdAt: now,
            createdBy: current.currentMemberId
          },
          ...current.pantryTransactions
        ],
        shoppingList: current.shoppingList
          ? { ...current.shoppingList, stale: true }
          : null
      };
    });
  }, []);

  const removePantryItem = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      pantry: current.pantry.filter((item) => item.id !== id),
      shoppingList: current.shoppingList
        ? { ...current.shoppingList, stale: true }
        : null
    }));
  }, []);

  const generateList = useCallback(() => {
    setState((current) => ({
      ...current,
      shoppingList: generateShoppingList(
        current.weeklyPlan,
        current.recipes,
        current.pantry,
        current.shoppingList
      )
    }));
  }, []);

  const toggleShoppingItem = useCallback((id: string) => {
    setState((current) => {
      if (!current.shoppingList) return current;
      const now = new Date().toISOString();
      return {
        ...current,
        shoppingList: {
          ...current.shoppingList,
          updatedAt: now,
          items: current.shoppingList.items.map((item) =>
            item.id === id
              ? (() => {
                  const checked = !item.checked;
                  void queueShoppingMutation({
                    itemId: item.id,
                    operation: checked ? "check" : "uncheck"
                  });
                  return { ...item, checked, updatedAt: now };
                })()
              : item
          )
        }
      };
    });
  }, []);

  const addShoppingItem = useCallback((name: string) => {
    setState((current) => {
      if (!current.shoppingList) return current;
      const now = new Date().toISOString();
      const item: ShoppingListItem = {
        id: localId("shopping-item"),
        shoppingListId: current.shoppingList.id,
        name,
        canonicalName: canonicalizeIngredient(name),
        quantity: 1,
        unit: "count",
        dimension: "count",
        aisle: inferAisle(name),
        checked: false,
        manual: true,
        sources: [],
        updatedAt: now
      };
      void queueShoppingMutation({
        itemId: item.id,
        operation: "add",
        payload: item as unknown as Record<string, unknown>
      });
      return {
        ...current,
        shoppingList: {
          ...current.shoppingList,
          updatedAt: now,
          items: [...current.shoppingList.items, item]
        }
      };
    });
  }, []);

  const markListStale = useCallback(() => {
    setState((current) => ({
      ...current,
      shoppingList: current.shoppingList
        ? { ...current.shoppingList, stale: true }
        : null
    }));
  }, []);

  const completeShopping = useCallback((itemIds: string[]) => {
    setState((current) => {
      if (!current.shoppingList) return current;
      const now = new Date().toISOString();
      let pantry = [...current.pantry];
      const transactions = [...current.pantryTransactions];
      for (const item of current.shoppingList.items.filter((candidate) =>
        itemIds.includes(candidate.id)
      )) {
        if (item.quantity === null) continue;
        const existing = pantry.find(
          (stock) =>
            stock.canonicalName === item.canonicalName &&
            stock.dimension === item.dimension
        );
        if (!existing) {
          const newItem: PantryItem = {
            id: localId("pantry"),
            householdId: current.household.id,
            name: item.name,
            canonicalName: item.canonicalName,
            quantity: item.quantity,
            unit: item.unit,
            dimension: item.dimension,
            aisle: item.aisle,
            needsConfirmation: false,
            updatedAt: now
          };
          pantry = [newItem, ...pantry];
          transactions.unshift({
            id: localId("pantry-tx"),
            pantryItemId: newItem.id,
            householdId: current.household.id,
            kind: "restock",
            quantityDelta: item.quantity,
            unit: item.unit,
            note: "Added after shopping",
            createdAt: now,
            createdBy: current.currentMemberId
          });
          continue;
        }
        const existingBase = toBaseQuantity(existing.quantity, existing.unit);
        const purchaseBase = toBaseQuantity(item.quantity, item.unit);
        if (
          existingBase.quantity !== null &&
          purchaseBase.quantity !== null &&
          existingBase.dimension === purchaseBase.dimension
        ) {
          const stockUnit = normalizeUnit(existing.unit);
          existing.quantity =
            (existingBase.quantity + purchaseBase.quantity) / stockUnit.factor;
          existing.needsConfirmation = false;
          existing.updatedAt = now;
          transactions.unshift({
            id: localId("pantry-tx"),
            pantryItemId: existing.id,
            householdId: current.household.id,
            kind: "restock",
            quantityDelta: item.quantity,
            unit: item.unit,
            note: "Added after shopping",
            createdAt: now,
            createdBy: current.currentMemberId
          });
        }
      }
      return {
        ...current,
        pantry,
        pantryTransactions: transactions,
        shoppingList: {
          ...current.shoppingList,
          completedAt: now,
          updatedAt: now
        }
      };
    });
  }, []);

  const cookMeal: DemoStore["cookMeal"] = useCallback(
    (mealId, notes, adjustments) => {
      let createdProposal: RecipeChangeProposal | null = null;
      setState((current) => {
        const meal = current.weeklyPlan.meals.find(
          (candidate) => candidate.id === mealId
        );
        const recipe = current.recipes.find(
          (candidate) => candidate.id === meal?.recipeId
        );
        if (!meal || !recipe) return current;
        const result = markMealCooked({
          householdId: current.household.id,
          memberId: current.currentMemberId,
          meal,
          recipe,
          pantry: current.pantry,
          notes,
          adjustments
        });
        createdProposal = result.proposal;
        return {
          ...current,
          pantry: result.pantry,
          pantryTransactions: [
            ...result.transactions,
            ...current.pantryTransactions
          ],
          cookingSessions: [result.session, ...current.cookingSessions],
          proposals: result.proposal
            ? [result.proposal, ...current.proposals]
            : current.proposals,
          weeklyPlan: {
            ...current.weeklyPlan,
            meals: current.weeklyPlan.meals.map((candidate) =>
              candidate.id === mealId
                ? { ...candidate, cookedAt: result.session.cookedAt }
                : candidate
            )
          },
          shoppingList: current.shoppingList
            ? { ...current.shoppingList, stale: true }
            : null
        };
      });
      return createdProposal;
    },
    []
  );

  const reviewProposal: DemoStore["reviewProposal"] = useCallback(
    (proposalId, status, ingredients) => {
      let outcome: { ok: boolean; message?: string } = { ok: true };
      setState((current) => {
        const proposal = current.proposals.find(
          (candidate) => candidate.id === proposalId
        );
        const recipe = current.recipes.find(
          (candidate) => candidate.id === proposal?.recipeId
        );
        if (!proposal || !recipe) {
          outcome = { ok: false, message: "Proposal or recipe not found." };
          return current;
        }
        if (
          status === "approved" &&
          recipe.currentVersion !== proposal.basedOnVersion
        ) {
          outcome = {
            ok: false,
            message:
              "This recipe changed after the feedback was created. Review it again before applying."
          };
          return current;
        }
        const now = new Date().toISOString();
        const updatedProposal: RecipeChangeProposal = {
          ...proposal,
          status,
          proposedIngredients: ingredients ?? proposal.proposedIngredients,
          reviewedAt: now,
          reviewedBy: current.currentMemberId
        };
        const nextVersion = recipe.currentVersion + 1;
        const updatedRecipe =
          status === "approved"
            ? {
                ...recipe,
                currentVersion: nextVersion,
                versions: [
                  ...recipe.versions,
                  {
                    ...recipe.versions.find(
                      (version) =>
                        version.version === recipe.currentVersion
                    )!,
                    id: localId("recipe-version"),
                    version: nextVersion,
                    createdAt: now,
                    createdBy: current.currentMemberId,
                    note: proposal.note,
                    ingredients:
                      ingredients ?? proposal.proposedIngredients
                  }
                ]
              }
            : recipe;
        return {
          ...current,
          recipes: current.recipes.map((candidate) =>
            candidate.id === recipe.id ? updatedRecipe : candidate
          ),
          proposals: current.proposals.map((candidate) =>
            candidate.id === proposal.id ? updatedProposal : candidate
          ),
          shoppingList:
            status === "approved" && current.shoppingList
              ? { ...current.shoppingList, stale: true }
              : current.shoppingList
        };
      });
      return outcome;
    },
    []
  );

  const switchMember = useCallback((memberId: string) => {
    setState((current) => ({ ...current, currentMemberId: memberId }));
  }, []);

  const resetDemo = useCallback(() => {
    const fresh = createDemoState();
    setState(fresh);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  }, []);

  const value = useMemo<DemoStore>(
    () => ({
      state,
      loaded,
      scheduleRecipe,
      scheduleSpecial,
      removeMeal,
      addRecipe,
      toggleFavorite,
      upsertPantryItem,
      removePantryItem,
      generateList,
      toggleShoppingItem,
      addShoppingItem,
      markListStale,
      completeShopping,
      cookMeal,
      reviewProposal,
      switchMember,
      resetDemo
    }),
    [
      state,
      loaded,
      scheduleRecipe,
      scheduleSpecial,
      removeMeal,
      addRecipe,
      toggleFavorite,
      upsertPantryItem,
      removePantryItem,
      generateList,
      toggleShoppingItem,
      addShoppingItem,
      markListStale,
      completeShopping,
      cookMeal,
      reviewProposal,
      switchMember,
      resetDemo
    ]
  );

  return (
    <DemoStoreContext.Provider value={value}>
      {children}
    </DemoStoreContext.Provider>
  );
}

export function useDemoStore(): DemoStore {
  const store = useContext(DemoStoreContext);
  if (!store) {
    throw new Error("useDemoStore must be used inside DemoStoreProvider");
  }
  return store;
}
