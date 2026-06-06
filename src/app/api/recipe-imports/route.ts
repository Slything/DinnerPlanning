import { NextResponse } from "next/server";
import { z } from "zod";
import type { RecipeDraft } from "@/lib/domain/types";
import {
  canonicalizeIngredient,
  inferAisle,
  normalizeUnit
} from "@/lib/domain/quantities";
import {
  extractRecipeJsonLd,
  htmlToPlainText,
  safeFetchRecipePage
} from "@/lib/import/url-security";
import {
  importedRecipeJsonSchema,
} from "@/lib/import/recipe-schema";
import { parseOpenRouterRecipeContent } from "@/lib/openrouter/extraction";
import {
  OPENROUTER_RAILWAY_HINT,
  OpenRouterConfigurationError,
  defaultOpenRouterModelId,
  describeOpenRouterCompletionError,
  requireCompatibleModel
} from "@/lib/openrouter/models";
import { requireUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
const OPENROUTER_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";

const requestSchema = z.object({
  url: z.string().url().optional(),
  text: z.string().max(60_000).optional().default(""),
  images: z.array(z.string().max(8_000_000)).max(4).optional().default([]),
  modelId: z.string().trim().max(200).optional()
});

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    if (!supabase || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        {
          error: `OpenRouter is not configured because OPENROUTER_API_KEY is missing. ${OPENROUTER_RAILWAY_HINT}`,
          setupRequired: true,
          missingVariables: ["OPENROUTER_API_KEY"],
          railwayHint: OPENROUTER_RAILWAY_HINT
        },
        { status: 503 }
      );
    }
    const parsed = requestSchema.parse(await request.json());
    const { data: membership, error: membershipError } = await supabase
      .from("household_members")
      .select("households(ai_model_id)")
      .eq("user_id", user.id)
      .single();
    if (membershipError) throw membershipError;
    const householdRelation = Array.isArray(membership.households)
      ? membership.households[0]
      : membership.households;
    const requestedModelId = parsed.modelId?.trim();
    const householdModelId = householdRelation?.ai_model_id?.trim();
    const imagesRequired = parsed.images.length > 0;
    let modelWarning: string | undefined;
    let modelId = "";
    if (requestedModelId) {
      modelId = requestedModelId;
      await requireCompatibleModel(modelId, imagesRequired);
    } else {
      const candidates = [
        {
          id: householdModelId,
          source: "saved household model"
        },
        {
          id: process.env.OPENROUTER_DEFAULT_MODEL?.trim(),
          source: "Railway default model"
        },
        {
          id: defaultOpenRouterModelId(),
          source: "app default model"
        }
      ].filter(
        (candidate): candidate is { id: string; source: string } =>
          Boolean(candidate.id)
      );
      const tried = new Set<string>();
      let lastError: Error | undefined;
      for (const candidate of candidates) {
        if (tried.has(candidate.id)) continue;
        tried.add(candidate.id);
        try {
          await requireCompatibleModel(candidate.id, imagesRequired);
          modelId = candidate.id;
          break;
        } catch (error) {
          lastError =
            error instanceof Error ? error : new Error(String(error));
          if (candidate.source === "saved household model") {
            modelWarning = `Your saved household OpenRouter model "${candidate.id}" could not be used, so the app used its default instead.`;
          }
        }
      }
      if (!modelId) {
        throw (
          lastError ??
          new OpenRouterConfigurationError(
            "Choose an OpenRouter model in the importer or configure OPENROUTER_DEFAULT_MODEL.",
            ["OPENROUTER_DEFAULT_MODEL"]
          )
        );
      }
    }

    let pageText = "";
    let structuredData: unknown[] = [];
    if (parsed.url) {
      try {
        const html = await safeFetchRecipePage(parsed.url);
        pageText = htmlToPlainText(html);
        structuredData = extractRecipeJsonLd(html);
      } catch (error) {
        pageText = `URL could not be fetched: ${
          error instanceof Error ? error.message : "unknown error"
        }`;
      }
    }
    const combinedText = [
      parsed.text,
      structuredData.length
        ? `Recipe JSON-LD:\n${JSON.stringify(structuredData).slice(0, 40_000)}`
        : "",
      pageText ? `Visible page text:\n${pageText}` : ""
    ]
      .filter(Boolean)
      .join("\n\n");
    if (!combinedText && parsed.images.length === 0) {
      throw new Error("Paste a recipe, add a link, or attach a screenshot.");
    }

    const content: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `Extract exactly one household recipe from the supplied material.
Never invent a precise quantity. Use null and add a warning when an amount is
unclear. Normalize common units without converting volume to weight. Keep
instructions concise and ordered. The user will review every field.

Source URL: ${parsed.url ?? "not supplied"}

${combinedText || "Use the attached screenshots."}`
      },
      ...parsed.images.map((image) => ({
        type: "image_url",
        image_url: { url: image }
      }))
    ];
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const response = await fetch(
      OPENROUTER_COMPLETIONS_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": appUrl,
          "X-OpenRouter-Title": "Gather & Graze"
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content }],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "recipe_draft",
              strict: true,
              schema: importedRecipeJsonSchema
            }
          },
          provider: {
            require_parameters: true,
            data_collection: "deny"
          },
          plugins: [{ id: "response-healing" }]
        })
      }
    );
    const responsePayload = (await response.json()) as OpenRouterResponse;
    if (!response.ok) {
      const providerMessage =
        responsePayload.error?.message ??
        `OpenRouter recipe extraction failed (${response.status}).`;
      throw new Error(describeOpenRouterCompletionError(providerMessage, modelId));
    }
    const output = responsePayload.choices?.[0]?.message?.content;
    if (!output) throw new Error("OpenRouter returned an empty recipe.");
    const extracted = parseOpenRouterRecipeContent(output);
    const draft: RecipeDraft = {
      ...extracted,
      sourceUrl: parsed.url,
      sourceCreator: extracted.sourceCreator || undefined,
      ingredients: extracted.ingredients.map((ingredient) => {
        const normalized = normalizeUnit(ingredient.unit);
        return {
          id: crypto.randomUUID(),
          name: ingredient.name,
          canonicalName: canonicalizeIngredient(ingredient.name),
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          dimension: normalized.dimension,
          preparation: ingredient.preparation || undefined,
          aisle: inferAisle(ingredient.name)
        };
      }),
      warnings: modelWarning
        ? [modelWarning, ...extracted.warnings]
        : extracted.warnings
    };
    return NextResponse.json(draft);
  } catch (error) {
    if (error instanceof OpenRouterConfigurationError) {
      return NextResponse.json(
        {
          error: error.message,
          setupRequired: true,
          missingVariables: error.missingVariables,
          railwayHint: OPENROUTER_RAILWAY_HINT
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Recipe import failed."
      },
      { status: 400 }
    );
  }
}
