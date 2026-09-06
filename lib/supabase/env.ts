export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

// Supabase now issues "publishable" keys (sb_publishable_…) in place of the legacy anon JWT.
// Both are safe for the browser and interchangeable for supabase-js; accept either name.
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  '';

export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

/**
 * Local mode: no auth, books + progress in localStorage. Active when
 * NEXT_PUBLIC_LOCAL_MODE=true, or automatically when Supabase isn't configured.
 */
export function isLocalMode(): boolean {
  return process.env.NEXT_PUBLIC_LOCAL_MODE === 'true' || !isSupabaseConfigured();
}
