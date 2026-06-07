import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DinnerPlannerApp } from "@/components/dinner-planner-app";
import type { AppState, Recipe } from "@/lib/domain/types";
import { AppStoreProvider } from "@/lib/store/store";

const initialState: AppState = {
  household: {
    id: "household-1",
    name: "Test Kitchen",
    defaultServings: 4,
    weekStartsOn: 0
  },
  members: [
    {
      id: "user-1",
      householdId: "household-1",
      email: "cook@example.com",
      displayName: "Cook",
      avatarColor: "#315c4a"
    }
  ],
  currentMemberId: "user-1",
  recipes: [],
  ingredientCatalog: [],
  weeklyPlan: {
    id: "plan-1",
    householdId: "household-1",
    weekStart: "2026-06-01",
    meals: [],
    updatedAt: "2026-06-01T00:00:00.000Z"
  },
  pantry: [],
  pantryTransactions: [],
  allocations: [],
  shoppingList: null,
  cookingSessions: [],
  proposals: [],
  recipeOrigins: []
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function openRecipesTab() {
  const recipesButtons = screen.getAllByRole("button", { name: "Recipes" });
  fireEvent.click(recipesButtons[recipesButtons.length - 1]);
}

function openAddRecipeModal() {
  const addRecipeButtons = screen.getAllByRole("button", {
    name: /Add recipe/i
  });
  fireEvent.click(addRecipeButtons[0]);
}

function recipeFixture(input: Partial<Recipe> & { id: string; title: string }): Recipe {
  return {
    id: input.id,
    householdId: "household-1",
    title: input.title,
    description: input.description ?? "A household favorite.",
    sourceUrl: input.sourceUrl,
    sourceCreator: input.sourceCreator,
    imageUrl: input.imageUrl,
    prepMinutes: input.prepMinutes ?? 0,
    cookMinutes: input.cookMinutes ?? 0,
    tags: input.tags ?? [],
    favorite: input.favorite ?? false,
    visibility: input.visibility ?? "private",
    sourceType: input.sourceType,
    sourceLabel: input.sourceLabel,
    attributionHousehold: input.attributionHousehold,
    updateAvailable: input.updateAvailable,
    currentVersion: input.currentVersion ?? 1,
    createdAt: input.createdAt ?? "2026-01-01T00:00:00.000Z",
    versions:
      input.versions ??
      [
        {
          id: `${input.id}-v1`,
          recipeId: input.id,
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          createdBy: "user-1",
          note: "Original",
          yield: 4,
          ingredients: [
            {
              id: `${input.id}-ingredient`,
              name: "Pasta",
              canonicalName: "pasta",
              quantity: 1,
              unit: "box",
              dimension: "package",
              aisle: "Pantry"
            }
          ],
          instructions: ["Cook it."]
        }
      ]
  };
}

describe("DinnerPlannerApp recipe importing", () => {
  it("shows a setup callout when OpenRouter is not configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/ai/models") {
          return new Response(
            JSON.stringify({
              error:
                "OpenRouter is not configured because OPENROUTER_API_KEY is missing.",
              setupRequired: true,
              missingVariables: ["OPENROUTER_API_KEY"],
              railwayHint:
                "In Railway, open the app service Variables tab and add OPENROUTER_API_KEY."
            }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        }
        throw new Error(`Unexpected fetch to ${String(input)}`);
      })
    );

    render(
      <AppStoreProvider initialState={initialState}>
        <DinnerPlannerApp />
      </AppStoreProvider>
    );

    openRecipesTab();
    await screen.findByRole("heading", { name: "Recipe Book" });
    openAddRecipeModal();
    const dialog = await screen.findByRole("dialog", { name: "Add a recipe" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Import with AI" }));

    expect(await screen.findByText("OpenRouter setup needed")).toBeVisible();
    expect(screen.getAllByText(/OPENROUTER_API_KEY/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Railway/)).toBeVisible();
  });

  it("does not auto-select the first OpenRouter model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/ai/models") {
          return new Response(
            JSON.stringify({
              models: [
                {
                  id: "ai21/jamba-large-1.7",
                  name: "AI21 Jamba Large 1.7",
                  contextLength: 8000,
                  supportsImages: false,
                  supportsStructuredOutput: true
                }
              ]
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        throw new Error(`Unexpected fetch to ${String(input)}`);
      })
    );

    render(
      <AppStoreProvider initialState={initialState}>
        <DinnerPlannerApp />
      </AppStoreProvider>
    );

    openRecipesTab();
    await screen.findByRole("heading", { name: "Recipe Book" });
    openAddRecipeModal();
    const dialog = await screen.findByRole("dialog", { name: "Add a recipe" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Import with AI" }));

    const modelInput = await within(dialog).findByPlaceholderText(
      "Use app default"
    );

    expect(modelInput).toHaveValue("");
    expect(modelInput).toHaveAttribute("placeholder", "Use app default");
  });
});

describe("DinnerPlannerApp ingredient entry", () => {
  it("allows multi-word ingredient typing before cleanup runs", async () => {
    render(
      <AppStoreProvider initialState={initialState}>
        <DinnerPlannerApp />
      </AppStoreProvider>
    );

    openRecipesTab();
    await screen.findByRole("heading", { name: "Recipe Book" });
    openAddRecipeModal();
    const dialog = await screen.findByRole("dialog", { name: "Add a recipe" });
    const ingredientInput = within(dialog).getAllByPlaceholderText(
      "Ingredient"
    )[0] as HTMLInputElement;

    fireEvent.change(ingredientInput, { target: { value: "Garlic" } });
    fireEvent.change(ingredientInput, { target: { value: "Garlic " } });

    expect(ingredientInput).toHaveValue("Garlic ");

    fireEvent.change(ingredientInput, { target: { value: "Garlic Bread" } });
    expect(ingredientInput).toHaveValue("Garlic Bread");

    fireEvent.blur(ingredientInput);
    expect(ingredientInput).toHaveValue("Garlic bread");
  });

  it("lets the unit field be cleared and typed before normalizing", async () => {
    render(
      <AppStoreProvider initialState={initialState}>
        <DinnerPlannerApp />
      </AppStoreProvider>
    );

    openRecipesTab();
    await screen.findByRole("heading", { name: "Recipe Book" });
    openAddRecipeModal();
    const dialog = await screen.findByRole("dialog", { name: "Add a recipe" });
    const unitInput = within(dialog).getAllByPlaceholderText(
      "Unit"
    )[0] as HTMLInputElement;

    fireEvent.focus(unitInput);
    fireEvent.change(unitInput, { target: { value: "" } });
    expect(unitInput).toHaveValue("");

    fireEvent.change(unitInput, { target: { value: "box" } });
    expect(unitInput).toHaveValue("box");

    fireEvent.blur(unitInput);
    expect(unitInput).toHaveValue("box");
  });

  it("saves a chosen package unit instead of replacing it with a catalog default", async () => {
    let capturedPayload: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/app-actions") {
          capturedPayload = JSON.parse(String(init?.body));
          return new Response(JSON.stringify({ state: initialState }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        throw new Error(`Unexpected fetch to ${String(input)}`);
      })
    );

    render(
      <AppStoreProvider initialState={initialState}>
        <DinnerPlannerApp />
      </AppStoreProvider>
    );

    openRecipesTab();
    await screen.findByRole("heading", { name: "Recipe Book" });
    openAddRecipeModal();
    const dialog = await screen.findByRole("dialog", { name: "Add a recipe" });

    fireEvent.change(within(dialog).getByLabelText("Recipe name"), {
      target: { value: "Pasta night" }
    });
    fireEvent.change(within(dialog).getAllByPlaceholderText("Qty")[0], {
      target: { value: "1" }
    });
    fireEvent.change(within(dialog).getAllByPlaceholderText("Unit")[0], {
      target: { value: "box" }
    });
    fireEvent.change(within(dialog).getAllByPlaceholderText("Ingredient")[0], {
      target: { value: "Pasta" }
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save recipe" }));

    await waitFor(() => expect(capturedPayload).toBeDefined());

    const request = capturedPayload as {
      payload: {
        recipe: {
          ingredients: Array<{
            name: string;
            canonicalName: string;
            quantity: number;
            unit: string;
            dimension: string;
          }>;
        };
      };
    };
    expect(request.payload.recipe.ingredients[0]).toMatchObject({
      name: "Pasta",
      canonicalName: "pasta",
      quantity: 1,
      unit: "box",
      dimension: "package"
    });
  });
});

describe("DinnerPlannerApp recipe editing and labels", () => {
  it("edits an existing recipe and saves through updateRecipe", async () => {
    let capturedPayload: unknown;
    const recipe = recipeFixture({
      id: "recipe-1",
      title: "Spaghetti",
      tags: ["Quick Cook", "family"]
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/app-actions") {
          capturedPayload = JSON.parse(String(init?.body));
          return new Response(
            JSON.stringify({
              state: { ...initialState, recipes: [recipe] }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        throw new Error(`Unexpected fetch to ${String(input)}`);
      })
    );

    render(
      <AppStoreProvider initialState={{ ...initialState, recipes: [recipe] }}>
        <DinnerPlannerApp />
      </AppStoreProvider>
    );

    openRecipesTab();
    fireEvent.click(await screen.findByRole("heading", { name: "Spaghetti" }));
    const detail = await screen.findByRole("dialog", { name: "Spaghetti" });
    expect(within(detail).queryByText("family")).not.toBeInTheDocument();
    expect(within(detail).queryByText(/^v1$/)).not.toBeInTheDocument();

    fireEvent.click(within(detail).getByRole("button", { name: /Edit/i }));
    const editor = await screen.findByRole("dialog", { name: "Edit recipe" });
    fireEvent.change(within(editor).getByLabelText("Recipe name"), {
      target: { value: "Weeknight spaghetti" }
    });
    expect(within(editor).queryByLabelText("Tags")).not.toBeInTheDocument();
    fireEvent.click(within(editor).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(capturedPayload).toBeDefined());
    const request = capturedPayload as {
      action: string;
      payload: {
        recipeId: string;
        recipe: { title: string; tags: string[] };
      };
    };
    expect(request.action).toBe("updateRecipe");
    expect(request.payload.recipeId).toBe("recipe-1");
    expect(request.payload.recipe.title).toBe("Weeknight spaghetti");
    expect(request.payload.recipe.tags).toEqual(["Quick Cook"]);
  });

  it("labels public and saved recipes in the week picker", async () => {
    render(
      <AppStoreProvider
        initialState={{
          ...initialState,
          recipes: [
            recipeFixture({
              id: "public-spaghetti",
              title: "Spaghetti",
              visibility: "public",
              sourceType: "public-owned",
              sourceLabel: "Public"
            }),
            recipeFixture({
              id: "saved-spaghetti",
              title: "Spaghetti",
              attributionHousehold: "Mom's Kitchen",
              sourceType: "saved-copy",
              sourceLabel: "Saved from Mom's Kitchen"
            })
          ]
        }}
      >
        <DinnerPlannerApp />
      </AppStoreProvider>
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: /Add dinner/i })[0]
    );
    const picker = await screen.findByRole("dialog", {
      name: /Monday, June 1/
    });

    expect(within(picker).getAllByText("Public").length).toBeGreaterThan(1);
    expect(within(picker).getByText("Saved from Mom's Kitchen")).toBeVisible();
    expect(within(picker).queryByText(/^v1$/)).not.toBeInTheDocument();
    expect(
      within(picker).queryByRole("button", { name: "Saved recipes" })
    ).not.toBeInTheDocument();
  });
});

describe("DinnerPlannerApp community recipes", () => {
  it("shows the household's own public recipes in the community modal", async () => {
    const publicRecipe = recipeFixture({
      id: "public-spaghetti",
      title: "Spaghetti",
      visibility: "public",
      sourceType: "public-owned",
      sourceLabel: "Public"
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/community-recipes") {
          return new Response(JSON.stringify({ recipes: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        throw new Error(`Unexpected fetch to ${String(input)}`);
      })
    );

    render(
      <AppStoreProvider
        initialState={{
          ...initialState,
          recipes: [publicRecipe]
        }}
      >
        <DinnerPlannerApp />
      </AppStoreProvider>
    );

    openRecipesTab();
    await screen.findByRole("heading", { name: "Recipe Book" });
    fireEvent.click(screen.getByRole("button", { name: "Community" }));
    const modal = await screen.findByRole("dialog", {
      name: "Community recipes"
    });

    expect(within(modal).getByText("Your public recipes")).toBeVisible();
    expect(within(modal).getByText("Spaghetti")).toBeVisible();
    expect(within(modal).getByText("Public in your Recipe Book")).toBeVisible();
    expect(
      within(modal).queryByRole("button", { name: "Save copy" })
    ).not.toBeInTheDocument();
  });
});

describe("DinnerPlannerApp cooked flow", () => {
  function plannedDinnerState(recipe: Recipe): AppState {
    return {
      ...initialState,
      recipes: [recipe],
      weeklyPlan: {
        ...initialState.weeklyPlan,
        meals: [
          {
            id: "meal-1",
            householdId: "household-1",
            date: "2026-06-01",
            kind: "recipe",
            recipeId: recipe.id,
            servings: 4
          }
        ]
      }
    };
  }

  it("marks cooked as complete without ingredient adjustments", async () => {
    const recipe = recipeFixture({ id: "recipe-1", title: "Spaghetti" });
    const state = plannedDinnerState(recipe);
    let capturedPayload: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/app-actions") {
          capturedPayload = JSON.parse(String(init?.body));
          return new Response(
            JSON.stringify({
              state: {
                ...state,
                weeklyPlan: {
                  ...state.weeklyPlan,
                  meals: [
                    {
                      ...state.weeklyPlan.meals[0],
                      cookedAt: "2026-06-01T23:00:00.000Z"
                    }
                  ]
                }
              }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        throw new Error(`Unexpected fetch to ${String(input)}`);
      })
    );

    render(
      <AppStoreProvider initialState={state}>
        <DinnerPlannerApp />
      </AppStoreProvider>
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Mark Spaghetti cooked" })
    );
    const review = await screen.findByRole("dialog", {
      name: "How did Spaghetti go?"
    });

    expect(within(review).queryByText("Actually used")).not.toBeInTheDocument();
    expect(within(review).queryByText("Add adjustment")).not.toBeInTheDocument();

    fireEvent.click(within(review).getByRole("button", { name: "Complete" }));

    await waitFor(() => expect(capturedPayload).toBeDefined());
    expect(capturedPayload).toMatchObject({
      action: "cookMeal",
      payload: {
        mealId: "meal-1",
        notes: "",
        adjustments: []
      }
    });
  });

  it("opens the recipe editor after choosing change next time", async () => {
    const recipe = recipeFixture({ id: "recipe-1", title: "Spaghetti" });
    const state = plannedDinnerState(recipe);
    let capturedPayload: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/app-actions") {
          capturedPayload = JSON.parse(String(init?.body));
          return new Response(JSON.stringify({ state }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        throw new Error(`Unexpected fetch to ${String(input)}`);
      })
    );

    render(
      <AppStoreProvider initialState={state}>
        <DinnerPlannerApp />
      </AppStoreProvider>
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Mark Spaghetti cooked" })
    );
    const review = await screen.findByRole("dialog", {
      name: "How did Spaghetti go?"
    });
    fireEvent.click(
      within(review).getByRole("button", { name: "Change next time" })
    );

    await screen.findByRole("dialog", { name: "Edit recipe" });
    expect(capturedPayload).toMatchObject({
      action: "cookMeal",
      payload: {
        mealId: "meal-1",
        notes: "",
        adjustments: []
      }
    });
  });
});
