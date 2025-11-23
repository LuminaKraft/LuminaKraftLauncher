import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

// Supabase configuration from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check your .env.local file.'
  );
}

/**
 * Supabase client singleton
 * This client is configured with the anon key and will use Row Level Security (RLS)
 * to enforce permissions based on the authenticated user or anonymous session.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Auto-refresh tokens
    autoRefreshToken: true,
    // Persist session in localStorage
    persistSession: true,
    // Detect session from URL (useful for OAuth callbacks)
    detectSessionInUrl: true,
    // Storage key
    storageKey: 'luminakraft-auth',
  },
  global: {
    headers: {
      'x-luminakraft-client': 'luminakraft-launcher',
    },
  },
});

/**
 * Helper function to check if the user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session !== null && !session.user.is_anonymous;
}

/**
 * Helper function to check if the user has a specific role
 */
export async function hasRole(role: 'admin' | 'partner' | 'user'): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  return profile?.role === role;
}

/**
 * Helper function to get user profile
 */
export async function getUserProfile() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }

  return profile;
}
