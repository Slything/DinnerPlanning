import { NextResponse } from "next/server";
import { z } from "zod";
import type { PantryItem, Recipe, WeeklyPlan } from "@/lib/domain/types";
import { buildPantryReview } from "@/lib/domain/shopping";

const schema = z.object({
  plan: z.custom<WeeklyPlan>(),
  recipes: z.array(z.custom<Recipe>()),
  pantry: z.array(z.custom<PantryItem>())
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    return NextResponse.json(
      buildPantryReview(input.plan, input.recipes, input.pantry)
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid pantry review." },
      { status: 400 }
    );
  }
}

