import { NextResponse } from "next/server";
import { z } from "zod";

const mutationSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  operation: z.enum(["check", "uncheck", "add"]),
  payload: z.record(z.string(), z.unknown()).optional(),
  clientTimestamp: z.string().datetime()
});

export async function POST(request: Request) {
  try {
    const input = z
      .object({ mutations: z.array(mutationSchema).max(200) })
      .parse(await request.json());
    return NextResponse.json({
      applied: input.mutations.map((mutation) => mutation.id),
      serverTimestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed." },
      { status: 400 }
    );
  }
}

