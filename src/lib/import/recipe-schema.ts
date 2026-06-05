import { z } from "zod";

export const importedIngredientSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().nullable(),
  unit: z.string(),
  preparation: z.string(),
  aisle: z.enum([
    "Produce",
    "Meat",
    "Dairy",
    "Bakery",
    "Pantry",
    "Frozen",
    "Other"
  ])
});

export const importedRecipeSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  sourceCreator: z.string(),
  yield: z.number().positive(),
  prepMinutes: z.number().nonnegative(),
  cookMinutes: z.number().nonnegative(),
  tags: z.array(z.string()),
  ingredients: z.array(importedIngredientSchema).min(1),
  instructions: z.array(z.string()),
  warnings: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"])
});

export type ImportedRecipe = z.infer<typeof importedRecipeSchema>;

export const importedRecipeJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "description",
    "sourceCreator",
    "yield",
    "prepMinutes",
    "cookMinutes",
    "tags",
    "ingredients",
    "instructions",
    "warnings",
    "confidence"
  ],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    sourceCreator: { type: "string" },
    yield: { type: "number", minimum: 1 },
    prepMinutes: { type: "number", minimum: 0 },
    cookMinutes: { type: "number", minimum: 0 },
    tags: { type: "array", items: { type: "string" } },
    ingredients: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "quantity", "unit", "preparation", "aisle"],
        properties: {
          name: { type: "string" },
          quantity: { type: ["number", "null"] },
          unit: { type: "string" },
          preparation: { type: "string" },
          aisle: {
            type: "string",
            enum: [
              "Produce",
              "Meat",
              "Dairy",
              "Bakery",
              "Pantry",
              "Frozen",
              "Other"
            ]
          }
        }
      }
    },
    instructions: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["low", "medium", "high"] }
  }
} as const;
