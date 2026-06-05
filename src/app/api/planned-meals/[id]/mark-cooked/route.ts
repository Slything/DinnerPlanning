import { NextResponse } from "next/server";
import { z } from "zod";
import type {
  CookingAdjustment,
  PantryItem,
  PlannedMeal,
  Recipe
} from "@/lib/domain/types";
import { markMealCooked } from "@/lib/domain/cooking";

const schema = z.object({
  householdId: z.string(),
  memberId: z.string(),
  meal: z.custom<PlannedMeal>(),
  recipe: z.custom<Recipe>(),
  pantry: z.array(z.custom<PantryItem>()),
  notes: z.string().max(4_000).default(""),
  adjustments: z.array(z.custom<CookingAdjustment>())
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const input = schema.parse(await request.json());
    if (input.meal.id !== id) {
      return NextResponse.json(
        { error: "Meal ID does not match request path." },
        { status: 400 }
      );
    }
    return NextResponse.json(markMealCooked(input));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Cooking review failed."
      },
      { status: 400 }
    );
  }
}

