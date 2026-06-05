import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  itemIds: z.array(z.string()).max(500)
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const input = schema.parse(await request.json());
    return NextResponse.json({
      shoppingListId: id,
      completedAt: new Date().toISOString(),
      restockedItemIds: input.itemIds
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Completion failed." },
      { status: 400 }
    );
  }
}

