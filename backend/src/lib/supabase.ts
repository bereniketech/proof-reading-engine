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

export function createAdminSupabaseClient(): SupabaseClient {
  const supabaseUrl = getRequiredEnvironmentVariable('SUPABASE_URL');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin database access.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
