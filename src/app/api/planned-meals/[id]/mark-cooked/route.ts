import { z } from "zod";
import { POST as runAction } from "@/app/api/app-actions/route";
import type { CookingAdjustment } from "@/lib/domain/types";

const schema = z.object({
  notes: z.string().max(4_000).default(""),
  adjustments: z.array(z.custom<CookingAdjustment>()).default([]),
  weekStart: z.string().optional()
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const input = schema.parse(await request.json());
  return runAction(
    new Request(new URL("/api/app-actions", request.url), {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({
        action: "cookMeal",
        payload: { mealId: id, ...input }
      })
    })
  );
}
