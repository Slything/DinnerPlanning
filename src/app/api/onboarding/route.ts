import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  defaultServings: z.number().int().min(1).max(30),
  weekStartsOn: z.union([z.literal(0), z.literal(1)])
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const { supabase, user } = await requireUser();
    if (!supabase || !user) {
      return NextResponse.json(
        { error: "Sign in before creating a household." },
        { status: 401 }
      );
    }
    const { data, error } = await supabase.rpc("create_household", {
      household_name: input.name,
      household_default_servings: input.defaultServings,
      household_week_starts_on: input.weekStartsOn,
      member_display_name: user.displayName
    });
    if (error) throw error;
    return NextResponse.json({ householdId: data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Household creation failed."
      },
      { status: 400 }
    );
  }
}
