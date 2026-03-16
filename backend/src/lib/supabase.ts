import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function getRequiredEnvironmentVariable(name: 'SUPABASE_URL' | 'SUPABASE_ANON_KEY'): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for backend database access.`);
  }

  return value;
}

export function createUserScopedSupabaseClient(accessToken: string): SupabaseClient {
  const supabaseUrl = getRequiredEnvironmentVariable('SUPABASE_URL');
  const supabaseAnonKey = getRequiredEnvironmentVariable('SUPABASE_ANON_KEY');

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
