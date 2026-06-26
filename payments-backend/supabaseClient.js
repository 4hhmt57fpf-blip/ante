// Service-role Supabase client — BACKEND ONLY. Bypasses RLS; never expose this key.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Lazily fail only when actually used, so the server can still boot for non-DB routes
// in dev. Auth/DB routes will surface a clear error if these are unset.
export const supabaseAdmin = (url && serviceKey)
  ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

export function assertSupabase() {
  if (!supabaseAdmin) throw new Error('Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  return supabaseAdmin;
}
