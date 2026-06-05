import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding-form";
import { requireUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { supabase, user } = await requireUser();
  if (!supabase || !user) redirect("/auth?next=/onboarding");
  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membership) redirect("/");
  return <OnboardingForm displayName={user.displayName} />;
}
