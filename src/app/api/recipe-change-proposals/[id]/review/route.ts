import { NextResponse } from "next/server";
import { z } from "zod";
import type { IngredientAmount, Recipe } from "@/lib/domain/types";

const schema = z.object({
  status: z.enum(["approved", "ignored"]),
  recipe: z.custom<Recipe>(),
  basedOnVersion: z.number().int().positive(),
  ingredients: z.array(z.custom<IngredientAmount>()),
  memberId: z.string()
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const input = schema.parse(await request.json());
    if (
      input.status === "approved" &&
      input.recipe.currentVersion !== input.basedOnVersion
    ) {
      return NextResponse.json(
        {
          error:
            "Recipe changed after this proposal was created. Re-review against the latest version."
        },
        { status: 409 }
      );
    }
    const now = new Date().toISOString();
    const version = input.recipe.currentVersion + 1;
    return NextResponse.json({
      proposalId: id,
      status: input.status,
      recipe:
        input.status === "approved"
          ? {
              ...input.recipe,
              currentVersion: version,
              versions: [
                ...input.recipe.versions,
                {
                  ...input.recipe.versions.find(
                    (candidate) =>
                      candidate.version === input.recipe.currentVersion
                  )!,
                  id: crypto.randomUUID(),
                  version,
                  ingredients: input.ingredients,
                  createdAt: now,
                  createdBy: input.memberId,
                  note: "Approved cooking feedback"
                }
              ]
            }
          : input.recipe
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Review failed." },
      { status: 400 }
    );
  }
}

