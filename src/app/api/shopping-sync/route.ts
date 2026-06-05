import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";

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
    const { supabase, user } = await requireUser();
    if (!supabase || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const { data: membership, error: membershipError } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", user.id)
      .single();
    if (membershipError) throw membershipError;

    const applied: string[] = [];
    for (const mutation of input.mutations) {
      if (mutation.operation === "add") {
        const item = mutation.payload;
        if (!item) continue;
        const { error } = await supabase.from("shopping_list_items").upsert(
          {
            shopping_list_id: item.shoppingListId,
            household_id: membership.household_id,
            name: item.name,
            canonical_name: item.canonicalName,
            quantity: item.quantity,
            unit: item.unit,
            dimension: item.dimension,
            aisle: item.aisle,
            checked: Boolean(item.checked),
            manual: true,
            sources: item.sources ?? [],
            client_mutation_id: mutation.id
          },
          { onConflict: "client_mutation_id" }
        );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("shopping_list_items")
          .update({ checked: mutation.operation === "check" })
          .eq("id", mutation.itemId)
          .eq("household_id", membership.household_id);
        if (error) throw error;
      }
      applied.push(mutation.id);
    }
    return NextResponse.json({
      applied,
      serverTimestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed." },
      { status: 400 }
    );
  }
}
