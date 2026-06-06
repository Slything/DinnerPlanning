import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listOpenRouterModels,
  requireCompatibleModel
} from "@/lib/openrouter/models";
import { parseOpenRouterRecipeContent } from "@/lib/openrouter/extraction";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENROUTER_API_KEY;
});

describe("OpenRouter extraction", () => {
  it("rejects malformed JSON before recipe validation", () => {
    expect(() => parseOpenRouterRecipeContent("{not-json")).toThrow(
      "malformed JSON"
    );
  });
});

describe("OpenRouter model discovery", () => {
  it("explains Railway setup when the API key is missing", async () => {
    await expect(listOpenRouterModels(true)).rejects.toThrow(
      "OPENROUTER_API_KEY is missing"
    );
    await expect(listOpenRouterModels(true)).rejects.toThrow(
      "Railway"
    );
  });

  it("keeps structured models and validates image support", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "text/structured",
                name: "Text Structured",
                context_length: 1000,
                architecture: { input_modalities: ["text"] },
                supported_parameters: ["response_format"]
              },
              {
                id: "vision/structured",
                name: "Vision Structured",
                context_length: 2000,
                architecture: { input_modalities: ["text", "image"] },
                supported_parameters: ["structured_outputs"]
              },
              {
                id: "text/unstructured",
                architecture: { input_modalities: ["text"] },
                supported_parameters: []
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const models = await listOpenRouterModels(true);
    expect(models.map((model) => model.id)).toEqual([
      "text/structured",
      "vision/structured"
    ]);
    await expect(
      requireCompatibleModel("text/structured", true)
    ).rejects.toThrow("does not accept screenshot");
    await expect(
      requireCompatibleModel("custom/missing", false)
    ).rejects.toThrow("structured-output support");
  });
});
