import { NextResponse } from "next/server";
import { z } from "zod";
import type { RecipeDraft } from "@/lib/domain/types";
import {
  canonicalizeIngredient,
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
import { requireCompatibleModel } from "@/lib/openrouter/models";
import { requireUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

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
        { error: "OPENROUTER_API_KEY is not configured." },
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
    const modelId =
      parsed.modelId ||
      householdRelation?.ai_model_id ||
      process.env.OPENROUTER_DEFAULT_MODEL;
    if (!modelId) {
      throw new Error(
        "Choose an OpenRouter model or configure OPENROUTER_DEFAULT_MODEL."
      );
    }
    await requireCompatibleModel(modelId, parsed.images.length > 0);

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
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": appUrl,
          "X-OpenRouter-Title": "Dinner Made Easy"
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
      throw new Error(
        responsePayload.error?.message ??
          `OpenRouter request failed (${response.status}).`
      );
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
          aisle: ingredient.aisle
        };
      })
    };
    return NextResponse.json(draft);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Recipe import failed."
      },
      { status: 400 }
    );
  }
}
