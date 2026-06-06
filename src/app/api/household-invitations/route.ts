import { NextResponse } from "next/server";
import { z } from "zod";
import { appUrl, authCallbackUrl } from "@/lib/app-url";
import { createAdminSupabaseClient, requireUser } from "@/lib/supabase/server";

const schema = z.object({
  email: z.string().email()
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const normalizedEmail = input.email.toLowerCase();
    const { supabase, user } = await requireUser();
    const admin = createAdminSupabaseClient();
    if (!supabase || !user) {
      return NextResponse.json(
        { error: "Sign in before inviting someone." },
        { status: 401 }
      );
    }
    const { data: membership, error: membershipError } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", user.id)
      .single();
    if (membershipError || !membership) {
      return NextResponse.json(
        { error: "Create or join a household before sending invitations." },
        { status: 403 }
      );
    }
    const token = crypto.randomUUID();
    const { data, error } = await supabase
      .from("household_invitations")
      .insert({
        household_id: membership.household_id,
        email: normalizedEmail,
        token,
        invited_by: user.id
      })
      .select("id,email,expires_at")
      .single();
    if (error) throw error;
    const requestOrigin = new URL(request.url).origin;
    const invitePath = `/invite/${token}`;
    const inviteUrl = appUrl(invitePath, requestOrigin);
    const emailRedirectUrl = authCallbackUrl(invitePath, requestOrigin);
    let emailSent = false;
    let emailError: string | undefined;
    if (!admin) {
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
      id: data.id,
      email: data.email,
      expiresAt: data.expires_at,
      token,
      inviteUrl,
      emailSent,
      emailError
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invite failed." },
      { status: 400 }
    );
  }
}
