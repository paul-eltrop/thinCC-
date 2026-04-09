// Wrapper um fetch der automatisch das Supabase JWT der aktuellen
// Session als Authorization Header anhaengt. Ohne Session wird der
// Call abgebrochen — Backend ist tenant-isoliert und braucht das Token.

import { createClient } from '@/lib/supabase/client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const supabase = createClient();

  type SessionResult = Awaited<ReturnType<typeof supabase.auth.getSession>>;
  let result: SessionResult;
  try {
    result = await Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('getSession timeout')), 10000),
      ),
    ]);
  } catch {
    if (typeof window !== 'undefined') window.location.href = '/login?reason=session-timeout';
    throw new Error('Session lookup timed out — redirecting to login.');
  }

  const session = result.data.session;
  if (!session?.access_token) {
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('No session — redirecting to login.');
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);

  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

export { API_BASE };
