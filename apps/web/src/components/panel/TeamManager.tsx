'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/client-api';
import type { Role, TeamMember, TeamResponse } from '@/lib/types';
import { usePolling } from '@/lib/use-polling';
import { Sheet } from '../ui/Sheet';
import { PasswordField, suggestUsername, UsernameField } from './CredentialFields';
import { card, inputClass, primaryButton, secondaryButton } from './styles';

const ROLE_LABEL: Record<Role, string> = { OWNER: 'Dono', STAFF: 'Funcionário' };
const ROLE_HINT: Record<Role, string> = {
  OWNER: 'Acessa a retaguarda (cardápio, loja, relatórios, equipe) e o PDV.',
  STAFF: 'Acessa só o PDV: mesas, comandas, delivery, balcão e caixa.',
};
const date = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export interface ShareLink {
  title: string;
  description: string;
  url: string;
  expiresAt: string;
}

/** Equipe: membros, convites pendentes e links (convite e redefinição de senha) para enviar por WhatsApp. */
export function TeamManager({ slug }: { slug: string }) {
  const { data, error, refresh } = usePolling<TeamResponse>(`/restaurants/${slug}/team`, 60_000);
  const [inviting, setInviting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [passwordFor, setPasswordFor] = useState<TeamMember | null>(null);
  const [share, setShare] = useState<ShareLink | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, ok: string) {
    setMessage(null);
    try {
      await action();
      setMessage({ ok: true, text: ok });
      await refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Não foi possível concluir.' });
    }
  }

  if (!data) return <p className="text-muted">{error ?? 'Carregando...'}</p>;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Equipe</h1>
          <p className="text-sm text-muted">Cadastre o usuário e a senha de cada funcionário, defina quem é dono e remova acessos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setInviting(true)} className={secondaryButton}>
            Convidar por link
          </button>
          <button onClick={() => setAdding(true)} className={primaryButton}>
            + Cadastrar funcionário
          </button>
        </div>
      </div>

      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={`rounded-xl px-4 py-3 text-sm ring-1 ${message.ok ? 'text-emerald-300 ring-emerald-700/70' : 'bg-wine-deep text-red-200 ring-wine-hover/60'}`}
        >
          {message.text}
        </p>
      )}

      <section className={`${card} p-0`} aria-label="Membros">
        <ul className="divide-y divide-line">
          {data.members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {m.name} {m.isYou && <span className="text-xs font-normal text-muted">(você)</span>}
                </div>
                <div className="truncate text-sm text-muted">
                  {m.username ? `usuário: ${m.username}` : m.email} · desde {date(m.since)}
                </div>
              </div>
              <select
                aria-label={`Papel de ${m.name}`}
                value={m.role}
                onChange={(e) =>
                  void run(
                    () => api(`/restaurants/${slug}/members/${m.userId}`, { method: 'PATCH', body: { role: e.target.value } }),
                    `${m.name} agora é ${ROLE_LABEL[e.target.value as Role].toLowerCase()}.`,
                  )
                }
                className="rounded-xl border border-line bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-gold"
              >
                <option value="STAFF">Funcionário</option>
                <option value="OWNER">Dono</option>
              </select>
              <div className="flex gap-2 text-sm">
                {m.canResetPassword && (
                  <button onClick={() => setPasswordFor(m)} className="rounded-lg px-3 py-1.5 text-gold ring-1 ring-gold-deep hover:ring-gold">
                    Nova senha
                  </button>
                )}
                {!m.isYou &&
                  (confirmRemove === m.userId ? (
                    <>
                      <button
                        onClick={() => {
                          setConfirmRemove(null);
                          void run(() => api(`/restaurants/${slug}/members/${m.userId}`, { method: 'DELETE' }), `${m.name} não tem mais acesso.`);
                        }}
                        className="rounded-lg bg-wine-deep px-3 py-1.5 font-semibold text-red-200 ring-1 ring-wine-hover"
                      >
                        Confirmar remoção
                      </button>
                      <button onClick={() => setConfirmRemove(null)} className="px-2 text-muted hover:text-fg">
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmRemove(m.userId)} className="rounded-lg px-3 py-1.5 text-muted ring-1 ring-line hover:text-red-300">
                      Remover
                    </button>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {data.invites.length > 0 && (
        <section aria-label="Convites pendentes">
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-gold-soft uppercase">Convites pendentes</h2>
          <ul className="divide-y divide-line rounded-2xl bg-surface ring-1 ring-line">
            {data.invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{i.name}</span> <span className="text-muted">· {i.email}</span>
                  <span className="block text-xs text-muted">
                    {ROLE_LABEL[i.role]} · convidado por {i.createdBy} · vale até {date(i.expiresAt)}
                  </span>
                </span>
                <button
                  onClick={() => void run(() => api(`/restaurants/${slug}/invites/${i.id}`, { method: 'DELETE' }), 'Convite cancelado: o link não abre mais.')}
                  className="text-muted hover:text-red-300"
                >
                  Cancelar convite
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Perdeu o link? Convide de novo o mesmo e-mail: o link anterior deixa de valer.</p>
        </section>
      )}

      {adding && (
        <MemberSheet
          slug={slug}
          onClose={() => setAdding(false)}
          onCreated={(text) => {
            setAdding(false);
            setMessage({ ok: true, text });
            void refresh();
          }}
        />
      )}
      {passwordFor && (
        <PasswordSheet
          slug={slug}
          member={passwordFor}
          onClose={() => setPasswordFor(null)}
          onDone={(text) => {
            setPasswordFor(null);
            setMessage({ ok: true, text });
          }}
        />
      )}
      {inviting && (
        <InviteSheet
          slug={slug}
          onClose={() => setInviting(false)}
          onCreated={(link) => {
            setInviting(false);
            setShare(link);
            void refresh();
          }}
        />
      )}
      {share && <ShareSheet link={share} onClose={() => setShare(null)} />}
    </div>
  );
}

/** Cadastro direto: o dono define o usuário e a senha e passa para o funcionário. */
function MemberSheet({ slug, onClose, onCreated }: { slug: string; onClose: () => void; onCreated: (message: string) => void }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('STAFF');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/restaurants/${slug}/members`, { method: 'POST', body: { name, username, password, role } });
      onCreated(`${name.trim()} cadastrado como ${ROLE_LABEL[role].toLowerCase()}. Para entrar, o usuário é "${username}" com a senha que você definiu.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível cadastrar.');
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Cadastrar funcionário"
      footer={
        <button type="submit" form="member-form" disabled={saving} className={`${primaryButton} w-full py-3`}>
          {saving ? 'Cadastrando...' : 'Cadastrar'}
        </button>
      }
    >
      <form id="member-form" onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Nome</span>
          <input
            required
            minLength={2}
            maxLength={100}
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!usernameEdited) setUsername(suggestUsername(e.target.value));
            }}
            className={inputClass}
          />
        </label>
        <UsernameField
          value={username}
          onChange={(v) => {
            setUsernameEdited(true);
            setUsername(v);
          }}
        />
        <PasswordField value={password} onChange={setPassword} />
        <RolePicker role={role} onChange={setRole} />
        {error && (
          <p role="alert" className="rounded-xl bg-wine-deep px-3 py-2 text-sm text-red-200 ring-1 ring-wine-hover/60">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}

/** O dono define uma senha nova para o funcionário (as sessões abertas dele caem). */
function PasswordSheet({ slug, member, onClose, onDone }: { slug: string; member: TeamMember; onClose: () => void; onDone: (message: string) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/restaurants/${slug}/members/${member.userId}/password`, { method: 'PUT', body: { password } });
      onDone(`Senha de ${member.name} alterada. Os acessos abertos dessa pessoa foram encerrados.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível trocar a senha.');
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Nova senha · ${member.name}`}
      footer={
        <button type="submit" form="password-form" disabled={saving} className={`${primaryButton} w-full py-3`}>
          {saving ? 'Salvando...' : 'Salvar nova senha'}
        </button>
      }
    >
      <form id="password-form" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted">
          Entra com: <strong className="text-fg">{member.username ?? member.email}</strong>. Depois de salvar, passe a senha nova para a pessoa.
        </p>
        <PasswordField value={password} onChange={setPassword} label="Nova senha" />
        {error && (
          <p role="alert" className="rounded-xl bg-wine-deep px-3 py-2 text-sm text-red-200 ring-1 ring-wine-hover/60">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}

function RolePicker({ role, onChange }: { role: Role; onChange: (role: Role) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold">Papel</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {(['STAFF', 'OWNER'] as const).map((r) => (
          <label key={r} className={`cursor-pointer rounded-xl p-3 ring-1 ${role === r ? 'bg-gold/10 ring-gold' : 'ring-line hover:ring-gold-deep'}`}>
            <span className="flex items-center gap-2 font-semibold">
              <input type="radio" name="role" checked={role === r} onChange={() => onChange(r)} className="accent-gold" />
              {ROLE_LABEL[r]}
            </span>
            <span className="mt-1 block text-xs text-muted">{ROLE_HINT[r]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function InviteSheet({ slug, onClose, onCreated }: { slug: string; onClose: () => void; onCreated: (link: ShareLink) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('STAFF');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const invite = await api<{ token: string; name: string; expiresAt: string }>(`/restaurants/${slug}/invites`, {
        method: 'POST',
        body: { name, email, role },
      });
      onCreated({
        title: `Convite · ${invite.name}`,
        description: `Envie este link para ${invite.name}. Ao abrir, a pessoa cria a própria senha e já entra como ${ROLE_LABEL[role].toLowerCase()}. Vale por 7 dias e só pode ser usado uma vez.`,
        url: `${window.location.origin}/convite/${invite.token}`,
        expiresAt: invite.expiresAt,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o convite.');
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Convidar para a equipe"
      footer={
        <button type="submit" form="invite-form" disabled={saving} className={`${primaryButton} w-full py-3`}>
          {saving ? 'Gerando link...' : 'Gerar link de convite'}
        </button>
      }
    >
      <form id="invite-form" onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Nome</span>
          <input required minLength={2} maxLength={100} autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">E-mail</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          <span className="mt-1 block text-xs text-muted">A pessoa cria a própria senha pelo link e entra com este e-mail.</span>
        </label>
        <RolePicker role={role} onChange={setRole} />
        {error && (
          <p role="alert" className="rounded-xl bg-wine-deep px-3 py-2 text-sm text-red-200 ring-1 ring-wine-hover/60">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}

/** Link gerado (convite ou nova senha): copiar ou enviar pelo WhatsApp. Só aparece agora; o banco guarda só o hash. */
export function ShareSheet({ link, onClose }: { link: ShareLink; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${link.title.split(' · ')[0]} para o Bistroo: ${link.url}`)}`;
  return (
    <Sheet open onClose={onClose} title={link.title}>
      <div className="space-y-4">
        <p className="text-sm text-muted">{link.description}</p>
        <div className="flex gap-2">
          <input readOnly value={link.url} onFocus={(e) => e.target.select()} aria-label="Link" className={`${inputClass} font-mono text-xs`} />
          <button onClick={() => void copy()} className={`${secondaryButton} shrink-0`}>
            {copied ? '✓ Copiado' : 'Copiar'}
          </button>
        </div>
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={`${primaryButton} block w-full py-3 text-center`}>
          Enviar pelo WhatsApp
        </a>
        <p className="text-xs text-muted">Por segurança, este link aparece só agora. Se perder, gere outro.</p>
      </div>
    </Sheet>
  );
}
