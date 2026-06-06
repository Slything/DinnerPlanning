import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { requireUser } from "@/lib/supabase/server";
import {
  extractRecipeJsonLd,
  htmlToPlainText,
  safeFetchRecipePage
} from "@/lib/import/url-security";
import { clearOpenRouterModelCache } from "@/lib/openrouter/models";

vi.mock("@/lib/supabase/server", () => ({
  requireUser: vi.fn()
}));

vi.mock("@/lib/import/url-security", () => ({
  extractRecipeJsonLd: vi.fn(),
  htmlToPlainText: vi.fn(),
  safeFetchRecipePage: vi.fn()
}));

function mockSignedInHousehold(aiModelId: string | null = null) {
  const single = vi.fn().mockResolvedValue({
    data: { households: { ai_model_id: aiModelId } },
    error: null
  });
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  vi.mocked(requireUser).mockResolvedValue({
    supabase: { from } as never,
    user: {
      id: "user-1",
      email: "cook@example.com",
      displayName: "Cook"
    }
  });
}

function openRouterFetch(
  content: Record<string, unknown>,
  models: Array<Record<string, unknown>> = [
    {
      id: "text/structured",
      name: "Text Structured",
      context_length: 8000,
      architecture: { input_modalities: ["text"] },
      supported_parameters: ["response_format"]
    }
  ]
) {
  let completionBody = "";
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/models")) {
        return new Response(
          JSON.stringify({
            data: models
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.endsWith("/chat/completions")) {
        completionBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(content) } }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }
  );
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, getCompletionBody: () => completionBody };
}

function request(body: Record<string, unknown>) {
  return new Request("https://app.example.com/api/recipe-imports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

const extractedRecipe = {
  title: "Weeknight Tacos",
  description: "Simple pantry tacos.",
  sourceCreator: "Creator",
  yield: 4,
  prepMinutes: 10,
  cookMinutes: 15,
  tags: ["Quick Cook"],
  ingredients: [
    {
      name: "Ground beef",
      quantity: 1,
      unit: "lb",
      preparation: ""
    }
  ],
  instructions: ["Brown beef.", "Serve in tortillas."],
  warnings: [],
  confidence: "high"
};

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  clearOpenRouterModelCache();
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_DEFAULT_MODEL;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("/api/recipe-imports", () => {
  it("returns setup metadata when OPENROUTER_API_KEY is missing", async () => {
    mockSignedInHousehold();

    const response = await POST(request({ text: "Taco recipe" }));
    const payload = (await response.json()) as {
      setupRequired: boolean;
      missingVariables: string[];
      railwayHint: string;
    };

    expect(response.status).toBe(503);
    expect(payload.setupRequired).toBe(true);
    expect(payload.missingVariables).toEqual(["OPENROUTER_API_KEY"]);
    expect(payload.railwayHint).toContain("Variables tab");
  });

  it("imports pasted text as an editable recipe draft", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_DEFAULT_MODEL = "text/structured";
    mockSignedInHousehold();
    openRouterFetch(extractedRecipe);

    const response = await POST(request({ text: "Ground beef taco recipe" }));
    const draft = await response.json();

    expect(response.status).toBe(200);
    expect(draft.title).toBe("Weeknight Tacos");
    expect(draft.ingredients[0]).toMatchObject({
      name: "Ground beef",
      canonicalName: "ground beef",
      unit: "lb"
    });
  });

  it("uses the recommended default when no override or Railway default is set", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    mockSignedInHousehold();
    const { getCompletionBody } = openRouterFetch(extractedRecipe, [
      {
        id: "ai21/jamba-large-1.7",
        name: "AI21 Jamba Large 1.7",
        context_length: 8000,
        architecture: { input_modalities: ["text"] },
        supported_parameters: ["response_format"]
      },
      {
        id: "google/gemini-2.5-flash-lite",
        name: "Gemini 2.5 Flash Lite",
        context_length: 8000,
        architecture: { input_modalities: ["text"] },
        supported_parameters: ["response_format"]
      }
    ]);

    const response = await POST(request({ text: "Ground beef taco recipe" }));
    const completionBody = JSON.parse(getCompletionBody()) as {
      model: string;
    };

    expect(response.status).toBe(200);
    expect(completionBody.model).toBe("google/gemini-2.5-flash-lite");
  });

  it("uses an explicitly selected compatible model as an override", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    mockSignedInHousehold();
    const { getCompletionBody } = openRouterFetch(extractedRecipe, [
      {
        id: "custom/structured",
        name: "Custom Structured",
        context_length: 8000,
        architecture: { input_modalities: ["text"] },
        supported_parameters: ["response_format"]
      },
      {
        id: "google/gemini-2.5-flash-lite",
        name: "Gemini 2.5 Flash Lite",
        context_length: 8000,
        architecture: { input_modalities: ["text"] },
        supported_parameters: ["response_format"]
      }
    ]);

    const response = await POST(
      request({ text: "Ground beef taco recipe", modelId: "custom/structured" })
    );
    const completionBody = JSON.parse(getCompletionBody()) as {
      model: string;
    };

    expect(response.status).toBe(200);
    expect(completionBody.model).toBe("custom/structured");
  });

  it("explains OpenRouter endpoint routing failures", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_DEFAULT_MODEL = "text/structured";
    mockSignedInHousehold();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/models")) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: "text/structured",
                  name: "Text Structured",
                  context_length: 8000,
                  architecture: { input_modalities: ["text"] },
                  supported_parameters: ["response_format"]
                }
              ]
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        if (url.endsWith("/chat/completions")) {
          return new Response(
            JSON.stringify({
              error: {
                message: "No endpoints found that can handle the request"
              }
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        throw new Error(`Unexpected fetch to ${url}`);
      })
    );

    const response = await POST(request({ text: "Ground beef taco recipe" }));
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(payload.error).toContain("could not find a provider endpoint");
    expect(payload.error).toContain("Clear the model field");
  });

  it("passes URL structured data into the OpenRouter extraction request", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_DEFAULT_MODEL = "text/structured";
    process.env.NEXT_PUBLIC_APP_URL = "https://gather.example.com";
    mockSignedInHousehold();
    vi.mocked(safeFetchRecipePage).mockResolvedValue("<html>recipe</html>");
    vi.mocked(extractRecipeJsonLd).mockReturnValue([
      { "@type": "Recipe", name: "Structured tacos" }
    ]);
    vi.mocked(htmlToPlainText).mockReturnValue("Visible taco recipe text.");
    const { getCompletionBody } = openRouterFetch(extractedRecipe);

    const response = await POST(
      request({ url: "https://recipes.example.com/tacos" })
    );
    const draft = await response.json();
    const completionBody = JSON.parse(getCompletionBody()) as {
      messages: Array<{ content: Array<{ text?: string }> }>;
    };
    const promptText = completionBody.messages[0].content[0].text ?? "";

    expect(response.status).toBe(200);
    expect(draft.sourceUrl).toBe("https://recipes.example.com/tacos");
    expect(promptText).toContain("Recipe JSON-LD");
    expect(promptText).toContain("Structured tacos");
    expect(promptText).toContain("Visible taco recipe text");
  });
});
