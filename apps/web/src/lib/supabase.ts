import { createClient } from '@supabase/supabase-js'
import type { Database } from '@sanchay/shared'

const supabaseUrl =
  (import.meta.env['VITE_SUPABASE_URL'] as string | undefined) || 'http://127.0.0.1:54321'
const supabaseAnonKey =
  (import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key_for_local_development'

if (!import.meta.env['VITE_SUPABASE_URL'] || !import.meta.env['VITE_SUPABASE_ANON_KEY']) {
  console.warn(
    'Running with fallback local Supabase credentials. Configure VITE_SUPABASE_URL in .env if using cloud sync.',
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  global: {
    headers: {
      'X-Client-Info': 'sanchay-web',
    },
  },
})
