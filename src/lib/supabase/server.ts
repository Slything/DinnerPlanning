import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { hasSupabaseAdminConfig, hasSupabaseConfig } from "@/lib/supabase/config";

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
}

export async function createServerSupabaseClient() {
  if (!hasSupabaseConfig()) return null;
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components cannot always write cookies.
          }
        }
      }
    }
  );
}

export function createAdminSupabaseClient() {
  if (!hasSupabaseAdminConfig()) return null;
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

export async function requireUser() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, user: null };
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return { supabase, user: null };
  const metadata =
    claims.user_metadata && typeof claims.user_metadata === "object"
      ? (claims.user_metadata as Record<string, unknown>)
      : {};
  const email = typeof claims.email === "string" ? claims.email : "";
  const user: AuthenticatedUser = {
    id: String(claims.sub),
    email,
    displayName:
      typeof metadata.display_name === "string" && metadata.display_name
        ? metadata.display_name
        : email.split("@")[0] || "Household member"
  };
  return { supabase, user };
}
