import { NextResponse } from "next/server";
import { buildPantryReview } from "@/lib/domain/shopping";
import { loadAppState } from "@/lib/supabase/app-state";
import { requireUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    if (!supabase || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const url = new URL(request.url);
    const input = (await request.json().catch(() => ({}))) as {
      weekStart?: string;
    };
    const state = await loadAppState(supabase, user, {
      weekStart: input.weekStart ?? url.searchParams.get("weekStart") ?? undefined
    });
    if (!state) {
      return NextResponse.json(
        { error: "Household membership required." },
        { status: 403 }
      );
    }
    return NextResponse.json(
      buildPantryReview(state.weeklyPlan, state.recipes, state.pantry)
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid pantry review."
      },
      { status: 400 }
    );
  }
}
