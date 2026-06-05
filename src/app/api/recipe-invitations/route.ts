import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSupabaseClient, requireUser } from "@/lib/supabase/server";

const schema = z.object({
  recipeId: z.string().uuid(),
  email: z.string().email()
});

export async function GET(request: Request) {
  try {
    const recipeId = new URL(request.url).searchParams.get("recipeId");
    const { supabase, user } = await requireUser();
    if (!supabase || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    if (!recipeId) throw new Error("Recipe ID is required.");
    const { data, error } = await supabase
      .from("recipe_shares")
      .select("id,recipient_email,active,expires_at,accepted_at,created_at")
      .eq("source_recipe_id", recipeId)
      .eq("kind", "private")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ shares: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Recipe shares failed."
      },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const normalizedEmail = input.email.toLowerCase();
    const { supabase, user } = await requireUser();
    const admin = createAdminSupabaseClient();
    if (!supabase || !user) {
      return NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 }
      );
    }
    const { data, error } = await supabase.rpc(
      "create_private_recipe_share",
      {
        target_recipe: input.recipeId,
        target_email: normalizedEmail
      }
    );
    if (error) throw error;
    const share = Array.isArray(data) ? data[0] : data;
    if (!share?.share_token) throw new Error("Recipe invitation was not created.");
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const inviteUrl = `${appUrl.replace(/\/$/, "")}/recipe-invite/${
      share.share_token
    }`;
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
              redirectTo: inviteUrl
            });
          if (inviteError) emailError = inviteError.message;
          else emailSent = true;
        }
      }
    }
    return NextResponse.json({
      shareId: share.share_id,
      expiresAt: share.expires_at,
      inviteUrl,
      emailSent,
      emailError
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Recipe invitation failed."
      },
      { status: 400 }
    );
  }
}
