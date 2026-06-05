import { NextResponse } from "next/server";
import { loadAppState } from "@/lib/supabase/app-state";
import { requireUser } from "@/lib/supabase/server";

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    if (!supabase || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const state = await loadAppState(supabase, user);
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
