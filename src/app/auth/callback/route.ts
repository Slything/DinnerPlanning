import { NextResponse } from "next/server";
import { appUrl } from "@/lib/app-url";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const callbackError =
    url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (callbackError) {
    const message = `${callbackError}. The email link may have expired, already been used, or be pointing to a URL that is not allowed in Supabase.`;
    return NextResponse.redirect(
      appUrl(`/auth?message=${encodeURIComponent(message)}`, url.origin)
    );
  }
  const supabase = await createServerSupabaseClient();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const message = `${error.message}. The email link may have expired, already been used, or be pointing to a URL that is not allowed in Supabase.`;
      return NextResponse.redirect(
        appUrl(`/auth?message=${encodeURIComponent(message)}`, url.origin)
      );
    }
  }
  return NextResponse.redirect(appUrl(next, url.origin));
}
