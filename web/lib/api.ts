// Wrapper um fetch der automatisch das Supabase JWT der aktuellen
// Session als Authorization Header anhaengt. Ohne Session wird der
// Call abgebrochen — Backend ist tenant-isoliert und braucht das Token.

import { createClient } from '@/lib/supabase/client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Keine Session — bitte einloggen.');
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);

  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

export { API_BASE };
