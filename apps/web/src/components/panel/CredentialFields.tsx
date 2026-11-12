'use client';

import { useState } from 'react';
import { inputClass } from './styles';

/** "João da Silva" → "joao.silva": sugestão de usuário a partir do nome. */
export function suggestUsername(name: string): string {
  const parts = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, '')
    .split(/\s+/)
    .filter((p) => p.length > 2 || /\d/.test(p));
  if (parts.length === 0) return '';
  return (parts.length === 1 ? parts[0]! : `${parts[0]}.${parts[parts.length - 1]}`).slice(0, 30);
}

/** Usuário do login: minúsculas, sem espaços (mesma regra da API). */
export function UsernameField({ value, onChange, label = 'Usuário', hint }: { value: string; onChange: (v: string) => void; label?: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      <input
        required
        minLength={3}
        maxLength={30}
        pattern="[a-z0-9][a-z0-9._\-]{1,28}[a-z0-9]"
        title="De 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s+/g, ''))}
        className={inputClass}
      />
      <span className="mt-1 block text-xs text-muted">{hint ?? 'É com ele que a pessoa entra. Ex.: joao.garcom'}</span>
    </label>
  );
}

/** Senha definida por quem cadastra, com opção de mostrar para conferir antes de passar à pessoa. */
export function PasswordField({ value, onChange, label = 'Senha' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-sm font-semibold">
        {label}
        <button type="button" onClick={() => setVisible((v) => !v)} className="text-xs font-normal text-gold">
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </span>
      <input
        type={visible ? 'text' : 'password'}
        required
        minLength={8}
        maxLength={200}
        autoComplete="new-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
      <span className="mt-1 block text-xs text-muted">Pelo menos 8 caracteres.</span>
    </label>
  );
}
