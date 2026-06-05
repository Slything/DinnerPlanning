import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";

const schema = z.object({ token: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const { token } = schema.parse(await request.json());
    const { supabase, user } = await requireUser();
    if (!supabase || !user) {
      return NextResponse.json(
        { error: "Sign in before accepting an invitation." },
        { status: 401 }
      );
    }
    const { data, error } = await supabase.rpc(
      "accept_household_invitation",
      { invitation_token: token }
    );
    if (error) throw error;
    return NextResponse.json({ householdId: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invite failed." },
      { status: 400 }
    );
  }
}

