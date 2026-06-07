import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://jgkibfvcfuefnarulhkt.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_-bqsIOxn_dgZf3rMoi_aCA_U11OZwWz';

const supabaseUrl = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_SUPABASE_URL).trim();
const supabasePublishableKey = ((
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY
) as string | undefined || DEFAULT_SUPABASE_PUBLISHABLE_KEY).trim();

function isValidSupabaseUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

const supabaseUrlValid = isValidSupabaseUrl(supabaseUrl);

export const supabaseConfigured = Boolean(supabaseUrlValid && supabasePublishableKey);

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function getSupabaseConfigStatus() {
  return {
    configured: supabaseConfigured,
    hasUrl: Boolean(supabaseUrl),
    hasValidUrl: supabaseUrlValid,
    hasPublishableKey: Boolean(supabasePublishableKey),
  };
}

export function formatSupabaseError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;

  const normalized = error.message.toLowerCase();
  if (
    normalized.includes('row-level security')
    || normalized.includes('permission denied')
    || normalized.includes('not authorized')
    || normalized.includes('unauthorized')
  ) {
    return 'You do not have permission to do that with your current Generator role.';
  }

  return error.message || fallback;
}
