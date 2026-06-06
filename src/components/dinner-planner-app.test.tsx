import {
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DinnerPlannerApp } from "@/components/dinner-planner-app";
import type { AppState } from "@/lib/domain/types";
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
