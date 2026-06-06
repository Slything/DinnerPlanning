import { fireEvent, render, screen } from "@testing-library/react";
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
  vi.unstubAllGlobals();
});

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

    fireEvent.click(screen.getByRole("button", { name: "Recipes" }));
    fireEvent.click(screen.getByRole("button", { name: /Add recipe/i }));
    fireEvent.click(screen.getByRole("button", { name: "Import with AI" }));

    expect(await screen.findByText("OpenRouter setup needed")).toBeVisible();
    expect(screen.getAllByText(/OPENROUTER_API_KEY/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Railway/)).toBeVisible();
  });
});
