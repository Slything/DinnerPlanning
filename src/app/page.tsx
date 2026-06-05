import { redirect } from "next/navigation";
import { DinnerPlannerApp } from "@/components/dinner-planner-app";
import { AppStoreProvider } from "@/lib/store/store";
import { loadAppState } from "@/lib/supabase/app-state";
import { requireUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { supabase, user } = await requireUser();
  if (!supabase || !user) redirect("/auth");
  const state = await loadAppState(supabase, user);
  if (!state) redirect("/onboarding");
  return (
    <AppStoreProvider initialState={state}>
      <DinnerPlannerApp />
    </AppStoreProvider>
  );
}
