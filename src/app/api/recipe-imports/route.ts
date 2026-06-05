import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  canonicalizeIngredient,
  inferAisle,
  normalizeUnit,
  parseQuantity
} from "@/lib/domain/quantities";
import {
  htmlToPlainText,
  extractRecipeJsonLd,
  safeFetchRecipePage
} from "@/lib/import/url-security";
import {
  importedRecipeJsonSchema,
  importedRecipeSchema
} from "@/lib/import/recipe-schema";
import type { RecipeDraft } from "@/lib/domain/types";

export const runtime = "nodejs";

const requestSchema = z.object({
  url: z.string().url().optional(),
  text: z.string().max(60_000).optional().default(""),
  images: z.array(z.string().max(8_000_000)).max(4).optional().default([])
});

function fallbackDraft(text: string, sourceUrl?: string): RecipeDraft {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const ingredientPattern =
    /^(\d+(?:\s+\d+\/\d+|\/\d+)?|[½⅓⅔¼¾⅛⅜⅝⅞])?\s*([a-zA-Z]+)?\s+(.+)$/;
  const ingredients = lines
    .filter(
      (line) =>
        /\d|[½⅓⅔¼¾⅛⅜⅝⅞]/.test(line) &&
        !/^[1-9]\s*[.)-]\s+/.test(line)
    )
    .slice(0, 20)
    .map((line, index) => {
      const match = line.match(ingredientPattern);
      const name = match?.[3]?.replace(/^of\s+/i, "") ?? line;
      const unit = match?.[2] ?? "count";
      const normalized = normalizeUnit(unit);
      return {
        id: `imported-${index}`,
        name,
        canonicalName: canonicalizeIngredient(name),
        quantity: parseQuantity(match?.[1] ?? null),
        unit,
        dimension: normalized.dimension,
        preparation: "",
        aisle: inferAisle(name)
      };
    });
  return {
    title: lines[0]?.slice(0, 90) || "Imported recipe",
    description: "",
    sourceUrl,
    yield: 4,
    prepMinutes: 0,
    cookMinutes: 0,
    tags: [],
    ingredients:
      ingredients.length > 0
        ? ingredients
        : [
            {
              id: "imported-placeholder",
              name: "Review and add ingredients",
              canonicalName: "review and add ingredients",
              quantity: null,
              unit: "count",
              dimension: "count",
              aisle: "Other"
            }
          ],
    instructions: lines.filter((line) => /^[1-9][.)]/.test(line)).slice(0, 20),
    warnings: [
      "AI importing is not configured, so this draft was parsed locally.",
      "Review ingredient quantities and instructions before saving."
    ],
    confidence: "low"
  };
}

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.parse(await request.json());
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

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(fallbackDraft(combinedText, parsed.url));
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const content: Array<
      | { type: "input_text"; text: string }
      | { type: "input_image"; image_url: string; detail: "high" }
    > = [
      {
        type: "input_text",
        text: `Extract one household recipe from the supplied material.
Never invent a precise quantity. Use null and add a warning when an amount is
unclear. Normalize common units but do not convert volume to weight. Keep
instructions concise and ordered. The user must review the result.

Source URL: ${parsed.url ?? "not supplied"}

${combinedText || "No readable text was supplied; use the images."}`
      },
      ...parsed.images.map((image) => ({
        type: "input_image" as const,
        image_url: image,
        detail: "high" as const
      }))
    ];
    const response = await client.responses.create({
      model: process.env.OPENAI_RECIPE_MODEL ?? "gpt-5.4-mini",
      input: [{ role: "user", content }],
      text: {
        format: {
          type: "json_schema",
          name: "recipe_draft",
          strict: true,
          schema: importedRecipeJsonSchema
        }
      }
    });
    const extracted = importedRecipeSchema.parse(
      JSON.parse(response.output_text)
    );
    const draft: RecipeDraft = {
      ...extracted,
      sourceUrl: parsed.url,
      sourceCreator: extracted.sourceCreator || undefined,
      ingredients: extracted.ingredients.map((ingredient, index) => {
        const normalized = normalizeUnit(ingredient.unit);
        return {
          id: `imported-${index}-${crypto.randomUUID()}`,
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
