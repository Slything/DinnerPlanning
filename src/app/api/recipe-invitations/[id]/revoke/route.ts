import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { supabase, user } = await requireUser();
    if (!supabase || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const { error } = await supabase.rpc("revoke_recipe_share", {
      target_share: id
    });
    if (error) throw error;
    return NextResponse.json({ revoked: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Revoke failed." },
      { status: 400 }
    );
  }
}
