import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSupabaseClient, requireUser } from "@/lib/supabase/server";

const schema = z.object({
  email: z.string().email(),
  householdId: z.string()
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const { user } = await requireUser();
    const admin = createAdminSupabaseClient();
    if (!admin || !user) {
      return NextResponse.json({
        id: `demo-invite-${crypto.randomUUID()}`,
        email: input.email,
        expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        demo: true
      });
    }
    const token = crypto.randomUUID();
    const { data, error } = await admin
      .from("household_invitations")
      .insert({
        household_id: input.householdId,
        email: input.email.toLowerCase(),
        token,
        invited_by: user.id
      })
      .select("id,email,expires_at")
      .single();
    if (error) throw error;
    return NextResponse.json({
      id: data.id,
      email: data.email,
      expiresAt: data.expires_at,
      token
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invite failed." },
      { status: 400 }
    );
  }
}

