'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { API_BASE } from '@/lib/api';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const signupRes = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        company_name: companyName,
        display_name: displayName,
      }),
    });

    if (!signupRes.ok) {
      const body = await signupRes.json().catch(() => ({ detail: 'Signup failed.' }));
      setError(body.detail || 'Signup failed.');
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(
        'Your account was created, but the automatic login failed. ' +
        'Please go to the login page and sign in with your credentials.',
      );
      setLoading(false);
      return;
    }

    router.push('/');
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center text-slate-900"
      style={{
        background: `radial-gradient(ellipse 90% 60% at 0% 0%, #E8F1FE 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 100% 0%, #FDE8E8 0%, transparent 50%), radial-gradient(ellipse 80% 70% at 50% 100%, #EFE5FE 0%, transparent 55%), #F7F3FB`,
      }}
    >
      <div className="w-full max-w-sm">
        <h1 className="text-[28px] font-semibold tracking-tight text-center mb-8">Tender Agent</h1>

        <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_2px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl">
          <h2 className="text-base font-semibold mb-6">Create account</h2>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full rounded-full border border-white/60 bg-white/50 px-4 py-2.5 text-sm text-slate-700 backdrop-blur-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Your Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-full border border-white/60 bg-white/50 px-4 py-2.5 text-sm text-slate-700 backdrop-blur-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-full border border-white/60 bg-white/50 px-4 py-2.5 text-sm text-slate-700 backdrop-blur-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                className="w-full rounded-full border border-white/60 bg-white/50 px-4 py-2.5 text-sm text-slate-700 backdrop-blur-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                required
              />
            </div>

            {error && (
              <p className="text-xs text-rose-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-slate-900 px-4 py-2.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
            >
              {loading ? 'Creating account...' : 'Sign up'}
            </button>
          </form>

          <p className="text-xs text-slate-500 text-center mt-4">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 hover:text-blue-700">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
