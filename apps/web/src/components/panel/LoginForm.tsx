'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/client-api';
import { inputClass, primaryButton } from './styles';

const DEMO = { email: 'demo@cardapio.dev', password: 'demo12345' };
const DEMO_STAFF = { email: 'garcom@cardapio.dev', password: 'demo12345' };

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function login(credentials = { email, password }) {
    setLoading(true);
    setError(null);
    try {
      await api('/auth/login', { method: 'POST', body: credentials });
      router.replace('/painel');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar.');
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void login();
        }}
        className="space-y-4"
      >
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">E-mail</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Senha</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>
        {error && (
          <p role="alert" className="rounded-xl border border-wine-hover/60 bg-wine-deep px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        )}
        <button type="submit" disabled={loading} className={`${primaryButton} w-full py-3`}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      <div className="mt-8 rounded-xl border border-gold-deep/50 bg-gold/5 p-4 text-sm">
        <p className="text-muted">Quer só conhecer o sistema? Use uma conta de demonstração:</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            { label: 'Entrar como dono', hint: 'Retaguarda + PDV', creds: DEMO },
            { label: 'Entrar como garçom', hint: 'Só o PDV', creds: DEMO_STAFF },
          ].map((d) => (
            <button
              key={d.label}
              type="button"
              disabled={loading}
              onClick={() => {
                setEmail(d.creds.email);
                setPassword(d.creds.password);
                void login(d.creds);
              }}
              className="rounded-lg px-3 py-2 text-left ring-1 ring-gold-deep hover:ring-gold disabled:opacity-60"
            >
              <span className="block font-semibold text-gold">{d.label}</span>
              <span className="block text-xs text-muted">{d.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
