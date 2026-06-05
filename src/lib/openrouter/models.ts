import type { AiModelOption } from "@/lib/domain/types";

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const CACHE_MS = 60 * 60 * 1000;

interface OpenRouterModel {
  id: string;
  name?: string;
  context_length?: number;
  architecture?: {
    input_modalities?: string[];
  };
  supported_parameters?: string[];
  pricing?: {
    prompt?: string;
    completion?: string;
  };
}

let cache:
  | {
      expiresAt: number;
      models: AiModelOption[];
    }
  | undefined;

export async function listOpenRouterModels(
  force = false
): Promise<AiModelOption[]> {
  if (!force && cache && cache.expiresAt > Date.now()) return cache.models;
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }
  const response = await fetch(MODELS_URL, {
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      Accept: "application/json"
    },
    next: { revalidate: 3600 }
  });
  if (!response.ok) {
    throw new Error(`OpenRouter model discovery failed (${response.status}).`);
  }
  const payload = (await response.json()) as { data?: OpenRouterModel[] };
  const models = (payload.data ?? [])
    .map(
      (model): AiModelOption => ({
        id: model.id,
        name: model.name ?? model.id,
        contextLength: model.context_length ?? 0,
        supportsImages:
          model.architecture?.input_modalities?.includes("image") ?? false,
        supportsStructuredOutput:
          model.supported_parameters?.some((parameter) =>
            ["response_format", "structured_outputs"].includes(parameter)
          ) ?? false,
        promptPrice: model.pricing?.prompt,
        completionPrice: model.pricing?.completion
      })
    )
    .filter((model) => model.supportsStructuredOutput)
    .sort((left, right) => left.name.localeCompare(right.name));
  cache = { expiresAt: Date.now() + CACHE_MS, models };
  return models;
}

export async function requireCompatibleModel(
  modelId: string,
  imagesRequired: boolean
): Promise<AiModelOption> {
  const model = (await listOpenRouterModels()).find(
    (candidate) => candidate.id === modelId
  );
  if (!model) {
    throw new Error(
      `The model "${modelId}" is not available with structured output support.`
    );
  }
  if (imagesRequired && !model.supportsImages) {
    throw new Error(
      `The model "${modelId}" does not accept screenshot or image input.`
    );
  }
  return model;
}
