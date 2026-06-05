import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";

const schema = z.object({ token: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const { supabase, user } = await requireUser();
    if (!supabase || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const { data, error } = await supabase.rpc(
      "accept_private_recipe_share",
      { share_token: input.token }
    );
    if (error) throw error;
    return NextResponse.json({ recipeId: data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Recipe invitation failed."
      },
      { status: 400 }
    );
  }
}
