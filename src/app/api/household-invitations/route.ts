import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorMessage } from "@/lib/api-errors";
import { appUrl, authCallbackUrl } from "@/lib/app-url";
import { createAdminSupabaseClient, requireUser } from "@/lib/supabase/server";

const schema = z.object({
  email: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim()
        ? value.trim().toLowerCase()
        : undefined,
    z.string().email().optional()
  )
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const normalizedEmail = input.email;
    const { supabase, user } = await requireUser();
    const admin = createAdminSupabaseClient();
    if (!supabase || !user) {
      return NextResponse.json(
        { error: "Sign in before inviting someone." },
        { status: 401 }
      );
    }
    const { data: invitationData, error } = await supabase.rpc(
      "create_household_invitation",
      { invite_email: normalizedEmail ?? null }
    );
    if (error) throw error;
    const invitation = Array.isArray(invitationData)
      ? invitationData[0]
      : invitationData;
    if (!invitation) throw new Error("Invitation could not be created.");
    const requestOrigin = new URL(request.url).origin;
    const invitePath = `/invite/${invitation.token}`;
    const inviteUrl = appUrl(invitePath, requestOrigin);
    const emailRedirectUrl = authCallbackUrl(invitePath, requestOrigin);
    let emailSent = false;
    let emailError: string | undefined;
    if (!normalizedEmail) {
      emailError = undefined;
    } else if (!admin) {
      emailError = "Supabase admin access is not configured.";
    } else {
      const { data: users, error: userListError } =
        await admin.auth.admin.listUsers({
          page: 1,
          perPage: 1000
        });
      if (userListError) {
        emailError = userListError.message;
      } else {
        const accountExists = users.users.some(
          (candidate) => candidate.email?.toLowerCase() === normalizedEmail
        );
        if (!accountExists) {
          const { error: inviteError } =
            await admin.auth.admin.inviteUserByEmail(normalizedEmail, {
              redirectTo: emailRedirectUrl
            });
          if (inviteError) emailError = inviteError.message;
          else emailSent = true;
        }
      }
    }
    return NextResponse.json({
      id: invitation.id,
      email: invitation.email,
      expiresAt: invitation.expires_at,
      token: invitation.token,
      inviteUrl,
      emailSent,
      emailError
    });
  } catch (error) {
    return NextResponse.json(
      { error: apiErrorMessage(error, "Invite failed.") },
      { status: 400 }
    );
  }
}
