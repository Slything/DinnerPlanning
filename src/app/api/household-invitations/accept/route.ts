import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorMessage } from "@/lib/api-errors";
import {
  createAdminSupabaseClient,
  requireUser
} from "@/lib/supabase/server";

const schema = z.object({
  token: z.string().uuid(),
  mode: z.enum(["accept", "switch-and-copy-recipes"]).default("accept")
});

export async function POST(request: Request) {
  try {
    const { token, mode } = schema.parse(await request.json());
    const { supabase, user } = await requireUser();
    const admin = createAdminSupabaseClient();
    if (!supabase || !user) {
      return NextResponse.json(
        { error: "Sign in before accepting an invitation." },
        { status: 401 }
      );
    }
    if (admin) {
      const { data: invitation, error: invitationError } = await admin
        .from("household_invitations")
        .select("id,email,expires_at,accepted_at,household_id,households(name)")
        .eq("token", token)
        .maybeSingle();
      if (invitationError) throw invitationError;
      if (!invitation) {
        return NextResponse.json(
          { error: "This invitation link is invalid." },
          { status: 404 }
        );
      }
      if (invitation.accepted_at) {
        return NextResponse.json(
          { error: "This invitation has already been used." },
          { status: 410 }
        );
      }
      if (new Date(invitation.expires_at).getTime() <= Date.now()) {
        return NextResponse.json(
          {
            error:
              "This invitation has expired. Ask the household to send a new invite."
          },
          { status: 410 }
        );
      }
      const invitedEmail = String(invitation.email).toLowerCase();
      const signedInEmail = user.email.toLowerCase();
      if (invitedEmail !== signedInEmail) {
        return NextResponse.json(
          {
            error: `This invitation is for ${invitation.email}, but you are signed in as ${user.email}. Sign out and use the invited email address.`
          },
          { status: 403 }
        );
      }
      const { data: membership, error: membershipError } = await admin
        .from("household_members")
        .select("household_id,households(name)")
        .eq("user_id", user.id)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (membership) {
        if (membership.household_id === invitation.household_id) {
          const { error: acceptError } = await admin
            .from("household_invitations")
            .update({ accepted_at: new Date().toISOString() })
            .eq("id", invitation.id);
          if (acceptError) throw acceptError;
          return NextResponse.json({ householdId: membership.household_id });
        }
        if (mode === "switch-and-copy-recipes") {
          const { data, error } = await supabase.rpc(
            "switch_household_from_invitation",
            { invitation_token: token }
          );
          if (error) throw error;
          const result = Array.isArray(data) ? data[0] : data;
          return NextResponse.json({
            householdId: result?.household_id ?? invitation.household_id,
            copiedRecipeCount: result?.copied_recipe_count ?? 0
          });
        }
        const currentHousehold = Array.isArray(membership.households)
          ? membership.households[0]
          : membership.households;
        const invitedHousehold = Array.isArray(invitation.households)
          ? invitation.households[0]
          : invitation.households;
        const { count, error: countError } = await admin
          .from("recipes")
          .select("id", { count: "exact", head: true })
          .eq("household_id", membership.household_id)
          .eq("created_by", user.id);
        if (countError) throw countError;
        return NextResponse.json(
          {
            error: "This account already belongs to another household.",
            code: "HOUSEHOLD_SWITCH_REQUIRED",
            currentHouseholdName:
              currentHousehold?.name ?? "your current household",
            invitedHouseholdName:
              invitedHousehold?.name ?? "the invited household",
            copiedRecipeCount: count ?? 0
          },
          { status: 409 }
        );
      }
    }
    const { data, error } = await supabase.rpc(
      "accept_household_invitation",
      { invitation_token: token }
    );
    if (error) throw error;
    return NextResponse.json({ householdId: data });
  } catch (error) {
    return NextResponse.json(
      { error: apiErrorMessage(error, "Invite failed.") },
      { status: 400 }
    );
  }
}
