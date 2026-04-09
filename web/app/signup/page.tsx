'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

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

    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (!authData.session) {
      setError('Please check your email to confirm your account before continuing.');
      setLoading(false);
      return;
    }

    await supabase.auth.setSession(authData.session);

    const userId = authData.user!.id;

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({ name: companyName })
      .select('id')
      .single();

    if (companyError) {
      setError(companyError.message);
      setLoading(false);
      return;
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ id: userId, company_id: company.id, display_name: displayName });

    if (profileError) {
      await supabase.from('companies').delete().eq('id', company.id);
      setError(profileError.message);
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
