import { z } from "zod";
import { POST as runAction } from "@/app/api/app-actions/route";

const schema = z.object({
  itemIds: z.array(z.string().uuid()).max(500),
  weekStart: z.string().optional()
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  const input = schema.parse(await request.json());
  return runAction(
    new Request(new URL("/api/app-actions", request.url), {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({
        action: "completeShopping",
        payload: input
      })
    })
  );
}
