import { z } from "zod";
import { POST as runAction } from "@/app/api/app-actions/route";
import type { IngredientAmount } from "@/lib/domain/types";

const schema = z.object({
  status: z.enum(["approved", "ignored"]),
  ingredients: z.array(z.custom<IngredientAmount>()).optional()
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
        action: "reviewProposal",
        payload: { proposalId: id, ...input }
      })
    })
  );
}
