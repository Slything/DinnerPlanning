import type { AiModelOption } from "@/lib/domain/types";

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const CACHE_MS = 60 * 60 * 1000;

export const RECOMMENDED_OPENROUTER_MODEL_ID =
  "google/gemini-2.5-flash-lite";

export const OPENROUTER_RAILWAY_HINT =
  "In Railway, open the app service Variables tab, add OPENROUTER_API_KEY, OPENROUTER_DEFAULT_MODEL, and NEXT_PUBLIC_APP_URL, then review and deploy the staged changes. Keep OPENROUTER_API_KEY server-only; do not prefix it with NEXT_PUBLIC_.";

export class OpenRouterConfigurationError extends Error {
  setupRequired = true;
  code = "openrouter_configuration";

  constructor(
    message: string,
    public missingVariables: string[]
  ) {
    super(`${message} ${OPENROUTER_RAILWAY_HINT}`);
    this.name = "OpenRouterConfigurationError";
  }
}

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

export function clearOpenRouterModelCache() {
  cache = undefined;
}

export function defaultOpenRouterModelId() {
  return (
    process.env.OPENROUTER_DEFAULT_MODEL?.trim() ||
    RECOMMENDED_OPENROUTER_MODEL_ID
  );
}

export async function listOpenRouterModels(
  force = false
): Promise<AiModelOption[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterConfigurationError(
      "OpenRouter is not configured because OPENROUTER_API_KEY is missing.",
      ["OPENROUTER_API_KEY"]
    );
  }
  if (!force && cache && cache.expiresAt > Date.now()) return cache.models;
  const response = await fetch(MODELS_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    },
    next: { revalidate: 3600 }
  });
  if (!response.ok) {
    throw new Error(
      `OpenRouter model discovery failed (${response.status}). Confirm OPENROUTER_API_KEY is valid, your OpenRouter account has access, and Railway has redeployed after variable changes.`
    );
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
      `The model "${modelId}" is not available with structured-output support. Choose a model from the dropdown or set OPENROUTER_DEFAULT_MODEL to a structured-output model returned by /api/ai/models.`
    );
  }
  if (imagesRequired && !model.supportsImages) {
    throw new Error(
      `The model "${modelId}" does not accept screenshot or image input.`
    );
  }
  return model;
}

export function describeOpenRouterCompletionError(
  message: string,
  modelId: string
) {
  if (message.toLowerCase().includes("no endpoints found")) {
    return `OpenRouter could not find a provider endpoint for "${modelId}" that can handle structured recipe extraction. Clear the model field to use the app default (${defaultOpenRouterModelId()}) or choose another structured-output model.`;
  }
  return `${message} Confirm the selected model supports structured output and your OpenRouter key has credits.`;
}
