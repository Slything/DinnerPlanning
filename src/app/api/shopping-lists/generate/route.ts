import { NextResponse } from "next/server";
import { z } from "zod";
import type {
  PantryItem,
  Recipe,
  ShoppingList,
  WeeklyPlan
} from "@/lib/domain/types";
import { generateShoppingList } from "@/lib/domain/shopping";

const schema = z.object({
  plan: z.custom<WeeklyPlan>(),
  recipes: z.array(z.custom<Recipe>()),
  pantry: z.array(z.custom<PantryItem>()),
  previous: z.custom<ShoppingList>().nullable().optional()
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    return NextResponse.json(
      generateShoppingList(
        input.plan,
        input.recipes,
        input.pantry,
        input.previous
      )
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "List generation failed."
      },
      { status: 400 }
    );
  }
}

