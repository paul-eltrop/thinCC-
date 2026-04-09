// Browser-side Supabase Client.
// Nutzt die oeffentlichen Env-Variablen fuer Client-Zugriff.
// Wird in Client Components verwendet.

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
