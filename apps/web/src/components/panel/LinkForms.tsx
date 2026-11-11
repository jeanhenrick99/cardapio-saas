'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/client-api';
import { inputClass, primaryButton } from './styles';

function Alert({ text }: { text: string }) {
  return (
    <p role="alert" className="rounded-xl border border-wine-hover/60 bg-wine-deep px-4 py-3 text-sm text-red-200">
      {text}
    </p>
  );
}

function Invalid({ text }: { text: string }) {
  return (
    <div className="w-full max-w-sm space-y-4 text-center">
      <Alert text={text} />
      <Link href="/login" className="text-sm text-gold">
        Ir para o login
      </Link>
    </div>
  );
}

function useLinkInfo<T>(path: string) {
  const [info, setInfo] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<T>(path)
      .then(setInfo)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Não foi possível abrir o link.'));
  }, [path]);
  return { info, error };
}

/** Senha + confirmação, com a mesma regra da API (mínimo de 8 caracteres). */
function NewPassword({ value, onChange, confirm, onConfirm }: { value: string; onChange: (v: string) => void; confirm: string; onConfirm: (v: string) => void }) {
  return (
    <>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Crie uma senha</span>
        <input type="password" required minLength={8} autoComplete="new-password" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
        <span className="mt-1 block text-xs text-muted">Pelo menos 8 caracteres.</span>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Repita a senha</span>
        <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => onConfirm(e.target.value)} className={inputClass} />
      </label>
    </>
  );
}

interface InviteInfo {
  restaurant: string;
  name: string;
  email: string;
  role: 'OWNER' | 'STAFF';
  existingUser: boolean;
}

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const { info, error: loadError } = useLinkInfo<InviteInfo>(`/invites/${encodeURIComponent(token)}`);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (info) setName(info.name);
  }, [info]);

  if (loadError) return <Invalid text={loadError} />;
  if (!info) return <p className="text-muted">Abrindo o convite...</p>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!info!.existingUser && password !== confirm) return setError('As senhas não conferem.');
    setSaving(true);
    setError(null);
    try {
      await api(`/invites/${encodeURIComponent(token)}/accept`, { method: 'POST', body: { name: name.trim() || undefined, password } });
      router.replace('/painel');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível aceitar o convite.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4">
      <p className="rounded-xl bg-surface px-4 py-3 text-sm ring-1 ring-line">
        Você foi convidado para a equipe do <strong>{info.restaurant}</strong> como <strong>{info.role === 'OWNER' ? 'dono' : 'funcionário'}</strong>.
        <span className="mt-1 block text-muted">Entrar com: {info.email}</span>
      </p>
      {info.existingUser ? (
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Este e-mail já tem conta. Digite a sua senha</span>
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </label>
      ) : (
        <>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Seu nome</span>
            <input required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </label>
          <NewPassword value={password} onChange={setPassword} confirm={confirm} onConfirm={setConfirm} />
        </>
      )}
      {error && <Alert text={error} />}
      <button type="submit" disabled={saving} className={`${primaryButton} w-full py-3`}>
        {saving ? 'Entrando...' : 'Aceitar convite e entrar'}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const { info, error: loadError } = useLinkInfo<{ name: string; email: string }>(`/password-resets/${encodeURIComponent(token)}`);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (loadError) return <Invalid text={loadError} />;
  if (!info) return <p className="text-muted">Abrindo o link...</p>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError('As senhas não conferem.');
    setSaving(true);
    setError(null);
    try {
      await api(`/password-resets/${encodeURIComponent(token)}`, { method: 'POST', body: { password } });
      router.replace('/painel');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível trocar a senha.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4">
      <p className="rounded-xl bg-surface px-4 py-3 text-sm ring-1 ring-line">
        Olá, <strong>{info.name}</strong>. Crie uma senha nova para {info.email}. Os acessos abertos em outros aparelhos serão encerrados.
      </p>
      <NewPassword value={password} onChange={setPassword} confirm={confirm} onConfirm={setConfirm} />
      {error && <Alert text={error} />}
      <button type="submit" disabled={saving} className={`${primaryButton} w-full py-3`}>
        {saving ? 'Salvando...' : 'Salvar nova senha e entrar'}
      </button>
    </form>
  );
}
