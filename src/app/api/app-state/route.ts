import { NextResponse } from "next/server";
import { loadAppState } from "@/lib/supabase/app-state";
import { requireUser } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    if (!supabase || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const url = new URL(request.url);
    const state = await loadAppState(supabase, user, {
      weekStart: url.searchParams.get("weekStart") ?? undefined
    });
    if (!state) {
      return NextResponse.json(
        { error: "Household membership required." },
        { status: 403 }
      );
    }
    return NextResponse.json(state);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "State load failed." },
      { status: 400 }
    );
  }
}
