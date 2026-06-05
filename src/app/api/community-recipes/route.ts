import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";

const acceptSchema = z.object({ recipeId: z.string().uuid() });

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    if (!supabase || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const { data, error } = await supabase.rpc("get_public_recipe_library");
    if (error) throw error;
    return NextResponse.json({ recipes: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Community library failed."
      },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const input = acceptSchema.parse(await request.json());
    const { supabase, user } = await requireUser();
    if (!supabase || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const { data, error } = await supabase.rpc("copy_public_recipe", {
      target_recipe: input.recipeId
    });
    if (error) throw error;
    return NextResponse.json({ recipeId: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Copy failed." },
      { status: 400 }
    );
  }
}
