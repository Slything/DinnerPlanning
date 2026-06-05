import { redirect } from "next/navigation";
import { RecipeInvitationAccept } from "@/components/recipe-invitation-accept";
import { requireUser } from "@/lib/supabase/server";

export default async function RecipeInvitationPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { user } = await requireUser();
  if (!user) {
    redirect(`/auth?next=${encodeURIComponent(`/recipe-invite/${token}`)}`);
  }
  return <RecipeInvitationAccept token={token} email={user.email} />;
}
