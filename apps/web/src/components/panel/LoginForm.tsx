'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/client-api';
import { inputClass, primaryButton } from './styles';

const DEMO = { email: 'demo@cardapio.dev', password: 'demo12345' };

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
        <p className="text-muted">Quer só conhecer o painel? Use a conta de demonstração:</p>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setEmail(DEMO.email);
            setPassword(DEMO.password);
            void login(DEMO);
          }}
          className="mt-3 w-full rounded-lg py-2 font-semibold text-gold ring-1 ring-gold-deep hover:ring-gold"
        >
          Entrar como demonstração
        </button>
      </div>
    </div>
  );
}
