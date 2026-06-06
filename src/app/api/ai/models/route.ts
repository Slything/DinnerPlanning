import { NextResponse } from "next/server";
import {
  OPENROUTER_RAILWAY_HINT,
  OpenRouterConfigurationError,
  listOpenRouterModels
} from "@/lib/openrouter/models";
import { requireUser } from "@/lib/supabase/server";

export async function GET() {
  try {
    const { user } = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    return NextResponse.json({ models: await listOpenRouterModels() });
  } catch (error) {
    if (error instanceof OpenRouterConfigurationError) {
      return NextResponse.json(
        {
          error: error.message,
          setupRequired: true,
          missingVariables: error.missingVariables,
          railwayHint: OPENROUTER_RAILWAY_HINT
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Model discovery failed."
      },
      { status: 503 }
    );
  }
}
