import { NextResponse } from "next/server";
import { z } from "zod";
import { rebuildPantryAllocations } from "@/lib/supabase/allocations";
import { requireUser } from "@/lib/supabase/server";

const applySchema = z.object({
  originId: z.string().uuid(),
  revisionId: z.string().uuid()
});

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    if (!supabase || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const { data: origins, error: originError } = await supabase
      .from("recipe_copy_origins")
      .select("id,recipe_id,share_id,last_applied_revision_id,updates_enabled");
    if (originError) throw originError;
    const { data: revisions, error: revisionError } = await supabase
      .from("recipe_share_revisions")
      .select("id,share_id,source_version,snapshot,created_at")
      .order("source_version", { ascending: false });
    if (revisionError) throw revisionError;
    const updates = (origins ?? []).flatMap((origin) => {
      if (!origin.updates_enabled) return [];
      const available = (revisions ?? []).filter(
        (revision) => revision.share_id === origin.share_id
      );
      const applied = available.find(
        (revision) => revision.id === origin.last_applied_revision_id
      );
      const latest = available[0];
      if (
        !latest ||
        Number(latest.source_version) <= Number(applied?.source_version ?? 0)
      ) {
        return [];
      }
      return [
        {
          originId: origin.id,
          recipeId: origin.recipe_id,
          revisionId: latest.id,
          sourceVersion: latest.source_version,
          snapshot: latest.snapshot,
          createdAt: latest.created_at
        }
      ];
    });
    return NextResponse.json({ updates });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Updates failed." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const input = applySchema.parse(await request.json());
    const { supabase, user } = await requireUser();
    if (!supabase || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const { data, error } = await supabase.rpc(
      "apply_recipe_share_revision",
      {
        target_origin: input.originId,
        target_revision: input.revisionId
      }
    );
    if (error) throw error;
    await rebuildPantryAllocations(supabase, user);
    const { data: membership } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", user.id)
      .single();
    if (membership) {
      await supabase
        .from("shopping_lists")
        .update({ stale: true })
        .eq("household_id", membership.household_id)
        .is("completed_at", null);
    }
    return NextResponse.json({ version: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed." },
      { status: 400 }
    );
  }
}
