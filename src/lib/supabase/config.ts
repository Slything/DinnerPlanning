export function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function hasSupabaseAdminConfig(): boolean {
  return Boolean(
    hasSupabaseConfig() && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

