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
  PlannedMeal,
  Recipe,
  RecipeChangeProposal,
  RecipeVisibility,
  ShoppingListItem
} from "@/lib/domain/types";
import {
  canonicalizeIngredient,
  inferAisle
} from "@/lib/domain/quantities";
import { createClient } from "@/lib/supabase/client";
import {
  queueShoppingMutation,
  saveActiveShoppingList,
  syncShoppingMutations
} from "@/lib/offline/shopping-queue";

interface PantryInput {
  id?: string;
  name: string;
  quantity: number | null;
  unit: string;
  needsConfirmation?: boolean;
}

type NewRecipe = Omit<
  Recipe,
  "id" | "householdId" | "createdAt" | "currentVersion" | "versions"
> & {
  yield: number;
  ingredients: IngredientAmount[];
  instructions: string[];
};

interface AppStore {
  state: AppState;
  loaded: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  scheduleRecipe: (date: string, recipeId: string) => void;
  scheduleSpecial: (date: string, kind: PlannedMeal["kind"]) => void;
  removeMeal: (mealId: string) => void;
  addRecipe: (recipe: NewRecipe) => Promise<boolean>;
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
  ) => Promise<RecipeChangeProposal | null>;
  reviewProposal: (
    proposalId: string,
    status: "approved" | "ignored",
    ingredients?: IngredientAmount[]
  ) => Promise<{ ok: boolean; message?: string }>;
  setRecipeVisibility: (
    recipeId: string,
    visibility: RecipeVisibility
  ) => void;
  setAiModel: (modelId: string) => void;
  restoreRecipeVersion: (recipeId: string, version: number) => void;
}

const AppStoreContext = createContext<AppStore | null>(null);

export function AppStoreProvider({
  initialState,
  children
}: {
  initialState: AppState;
  children: React.ReactNode;
}) {
  const [state, setState] = useState(initialState);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/app-state", { cache: "no-store" });
    if (!response.ok) return;
    setState((await response.json()) as AppState);
  }, []);

  const run = useCallback(
    async (
      action: string,
      payload: Record<string, unknown>
    ): Promise<AppState | null> => {
      const response = await fetch("/api/app-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload })
      });
      const result = (await response.json()) as {
        state?: AppState;
        error?: string;
      };
      if (!response.ok || !result.state) {
        setError(result.error ?? "The change could not be saved.");
        return null;
      }
      setError(null);
      setState(result.state);
      return result.state;
    },
    []
  );

  useEffect(() => {
    void saveActiveShoppingList(state.shoppingList);
  }, [state.shoppingList]);

  useEffect(() => {
    const sync = () => {
      void syncShoppingMutations()
        .then(refresh)
        .catch(() => undefined);
    };
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
    };
  }, [refresh]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    const channel = supabase
      .channel(`household-${state.household.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "planned_meals" },
        () => void refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pantry_items" },
        () => void refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shopping_list_items" },
        () => void refresh()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh, state.household.id]);

  const value = useMemo<AppStore>(
    () => ({
      state,
      loaded: true,
      error,
      refresh,
      scheduleRecipe(date, recipeId) {
        void run("scheduleMeal", {
          date,
          kind: "recipe",
          recipeId,
          servings: state.household.defaultServings
        });
      },
      scheduleSpecial(date, kind) {
        void run("scheduleMeal", {
          date,
          kind,
          servings: state.household.defaultServings
        });
      },
      removeMeal(mealId) {
        void run("removeMeal", { mealId });
      },
      async addRecipe(recipe) {
        return Boolean(await run("addRecipe", { recipe }));
      },
      toggleFavorite(recipeId) {
        void run("toggleFavorite", { recipeId });
      },
      upsertPantryItem(input) {
        void run("upsertPantry", input as unknown as Record<string, unknown>);
      },
      removePantryItem(id) {
        void run("removePantry", { id });
      },
      generateList() {
        void run("generateShoppingList", {});
      },
      toggleShoppingItem(id) {
        if (navigator.onLine) {
          void run("toggleShoppingItem", { id });
          return;
        }
        const item = state.shoppingList?.items.find(
          (candidate) => candidate.id === id
        );
        if (!item || !state.shoppingList) return;
        const checked = !item.checked;
        setState((current) => ({
          ...current,
          shoppingList: current.shoppingList
            ? {
                ...current.shoppingList,
                items: current.shoppingList.items.map((candidate) =>
                  candidate.id === id
                    ? {
                        ...candidate,
                        checked,
                        updatedAt: new Date().toISOString()
                      }
                    : candidate
                )
              }
            : null
        }));
        void queueShoppingMutation({
          itemId: id,
          operation: checked ? "check" : "uncheck"
        });
      },
      addShoppingItem(name) {
        if (navigator.onLine) {
          void run("addShoppingItem", { name });
          return;
        }
        if (!state.shoppingList) return;
        const item: ShoppingListItem = {
          id: crypto.randomUUID(),
          shoppingListId: state.shoppingList.id,
          name,
          canonicalName: canonicalizeIngredient(name),
          quantity: 1,
          unit: "count",
          dimension: "count",
          aisle: inferAisle(name),
          checked: false,
          manual: true,
          sources: [],
          updatedAt: new Date().toISOString()
        };
        setState((current) => ({
          ...current,
          shoppingList: current.shoppingList
            ? {
                ...current.shoppingList,
                items: [...current.shoppingList.items, item]
              }
            : null
        }));
        void queueShoppingMutation({
          itemId: item.id,
          operation: "add",
          payload: item as unknown as Record<string, unknown>
        });
      },
      markListStale() {
        void run("markListStale", {});
      },
      completeShopping(itemIds) {
        void run("completeShopping", { itemIds });
      },
      async cookMeal(mealId, notes, adjustments) {
        const nextState = await run("cookMeal", {
          mealId,
          notes,
          adjustments
        });
        return (
          nextState?.proposals.find(
            (proposal) =>
              proposal.status === "pending" &&
              proposal.recipeId ===
                nextState.weeklyPlan.meals.find((meal) => meal.id === mealId)
                  ?.recipeId
          ) ?? null
        );
      },
      async reviewProposal(proposalId, status, ingredients) {
        const nextState = await run("reviewProposal", {
          proposalId,
          status,
          ingredients
        });
        return nextState
          ? { ok: true }
          : { ok: false, message: "The proposal could not be reviewed." };
      },
      setRecipeVisibility(recipeId, visibility) {
        void run("setRecipeVisibility", { recipeId, visibility });
      },
      setAiModel(modelId) {
        void run("setAiModel", { modelId });
      },
      restoreRecipeVersion(recipeId, version) {
        void run("restoreRecipeVersion", { recipeId, version });
      }
    }),
    [error, refresh, run, state]
  );

  return (
    <AppStoreContext.Provider value={value}>
      {children}
    </AppStoreContext.Provider>
  );
}

export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext);
  if (!store) {
    throw new Error("useAppStore must be used inside AppStoreProvider");
  }
  return store;
}
