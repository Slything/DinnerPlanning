import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorMessage } from "@/lib/api-errors";
import { requireUser } from "@/lib/supabase/server";

const schema = z.object({
  token: z.string().uuid(),
  mode: z.enum(["accept", "switch-and-copy-recipes"]).default("accept")
});

export async function POST(request: Request) {
  try {
    const { token, mode } = schema.parse(await request.json());
    const { supabase, user } = await requireUser();
    if (!supabase || !user) {
      return NextResponse.json(
        { error: "Sign in before accepting an invitation." },
        { status: 401 }
      );
    }
    const { data, error } = await supabase.rpc(
      "accept_or_preview_household_invitation",
      {
        invitation_token: token,
        switch_and_copy: mode === "switch-and-copy-recipes"
      }
    );
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result) throw new Error("Invitation could not be accepted.");
    if (result.result_status === "switch_required") {
      return NextResponse.json(
        {
          error: "This account already belongs to another household.",
          code: "HOUSEHOLD_SWITCH_REQUIRED",
          currentHouseholdName:
            result.current_household_name ?? "your current household",
          invitedHouseholdName:
            result.invited_household_name ?? "the invited household",
          copiedRecipeCount: result.copied_recipe_count ?? 0
        },
        { status: 409 }
      );
    }
    return NextResponse.json({
      householdId: result.target_household_id,
      copiedRecipeCount: result.copied_recipe_count ?? 0
    });
  } catch (error) {
    return NextResponse.json(
      { error: apiErrorMessage(error, "Invite failed.") },
      { status: 400 }
    );
  }
}
