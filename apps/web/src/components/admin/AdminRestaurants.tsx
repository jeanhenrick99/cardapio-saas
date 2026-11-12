'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/client-api';
import { timeAgo } from '@/lib/panel';
import type { Me } from '@/lib/types';
import { usePolling } from '@/lib/use-polling';
import { PasswordField, suggestUsername, UsernameField } from '../panel/CredentialFields';
import { ShareSheet, type ShareLink } from '../panel/TeamManager';
import { inputClass, primaryButton, secondaryButton } from '../panel/styles';
import { Brand } from '../ui/Brand';
import { LogoutIcon, SearchIcon } from '../ui/icons';
import { Sheet } from '../ui/Sheet';

interface AdminRestaurant {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  acceptingOrders: boolean;
  owners: { name: string; email: string | null; username: string | null }[];
  pendingOwnerInvites: string[];
  membersCount: number;
  ordersCount: number;
  lastOrderAt: string | null;
  lastSupportAccess: { at: string; by: string } | null;
}

const date = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const ownerLink = (name: string, restaurant: string, token: string, expiresAt: string): ShareLink => ({
  title: `Acesso do dono · ${restaurant}`,
  description: `Envie este link para ${name}. Ao abrir, a pessoa cria a própria senha e entra como dono de ${restaurant}, podendo cadastrar a equipe. Vale por 7 dias e só pode ser usado uma vez.`,
  url: `${window.location.origin}/convite/${token}`,
  expiresAt,
});

/** Administração da plataforma: todos os restaurantes, cadastro de clientes e entrada em modo suporte. */
export function AdminRestaurants({ me }: { me: Me }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const { data, error, refresh } = usePolling<AdminRestaurant[]>(`/admin/restaurants${query ? `?q=${encodeURIComponent(query)}` : ''}`, 60_000);
  const [creating, setCreating] = useState(false);
  const [newOwnerFor, setNewOwnerFor] = useState<AdminRestaurant | null>(null);
  const [share, setShare] = useState<ShareLink | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [entering, setEntering] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  async function enter(r: AdminRestaurant, area: 'painel' | 'pdv') {
    setEntering(r.slug);
    setMessage(null);
    try {
      // Registra a entrada do suporte antes de abrir a base do cliente.
      await api(`/admin/restaurants/${r.slug}/enter`, { method: 'POST' });
      router.push(`/${area}/${r.slug}`);
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Não foi possível acessar.');
      setEntering(null);
    }
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-wine px-4 py-3 shadow-lg shadow-black/40 sm:px-6">
        <Brand size="sm" href="/admin" />
        <span className="rounded-md bg-black/30 px-2 py-0.5 text-xs font-bold tracking-widest text-gold uppercase ring-1 ring-gold/40">Admin</span>
        <span className="ml-auto hidden text-sm text-fg/80 sm:inline">{me.name}</span>
        <button onClick={() => void logout()} aria-label="Sair" title="Sair" className="rounded-lg p-1.5 text-fg/80 hover:text-fg">
          <LogoutIcon className="h-5 w-5" />
        </button>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold">Restaurantes</h1>
            <p className="text-sm text-muted">
              {data ? `${data.length} restaurante(s)${query ? ' encontrados' : ' na plataforma'}` : 'Carregando...'} · cadastre clientes e acesse a base de cada um
              para suporte.
            </p>
          </div>
          <button onClick={() => setCreating(true)} className={primaryButton}>
            + Novo restaurante
          </button>
        </div>

        <label className="relative block max-w-md">
          <span className="sr-only">Buscar restaurante</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, endereço ou login do dono" className={`${inputClass} pl-10`} />
        </label>

        {(message || error) && (
          <p role="alert" className="rounded-xl bg-wine-deep px-4 py-3 text-sm text-red-200 ring-1 ring-wine-hover/60">
            {message ?? error}
          </p>
        )}

        {notice && (
          <p role="status" className="rounded-xl px-4 py-3 text-sm text-emerald-300 ring-1 ring-emerald-700/70">
            {notice}
          </p>
        )}

        {data && data.length === 0 && <p className="py-10 text-center text-muted">Nenhum restaurante encontrado.</p>}

        <ul className="space-y-3">
          {(data ?? []).map((r) => (
            <li key={r.id} className="rounded-2xl bg-surface p-4 ring-1 ring-line sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl font-semibold">{r.name}</h2>
                    <span className="text-sm text-muted">/{r.slug}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <span className={`h-2 w-2 rounded-full ${r.acceptingOrders ? 'bg-emerald-400' : 'bg-red-400'}`} />
                      {r.acceptingOrders ? 'Loja aberta' : 'Loja fechada'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">
                    {r.owners.length > 0 ? (
                      <>
                        <span className="text-muted">Dono: </span>
                        {r.owners.map((o) => `${o.name} (${o.username ?? o.email})`).join(', ')}
                      </>
                    ) : (
                      <span className="text-gold-soft">Sem dono ainda</span>
                    )}
                    {r.pendingOwnerInvites.length > 0 && <span className="text-gold-soft"> · convite pendente: {r.pendingOwnerInvites.join(', ')}</span>}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Desde {date(r.createdAt)} · {r.membersCount} na equipe · {r.ordersCount} pedido(s)
                    {r.lastOrderAt && ` · último pedido ${timeAgo(r.lastOrderAt)}`}
                    {r.lastSupportAccess && ` · suporte ${timeAgo(r.lastSupportAccess.at)} por ${r.lastSupportAccess.by}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <button onClick={() => void enter(r, 'painel')} disabled={entering === r.slug} className={`${primaryButton} px-4 py-2`}>
                    {entering === r.slug ? 'Abrindo...' : 'Acessar retaguarda'}
                  </button>
                  <button onClick={() => void enter(r, 'pdv')} disabled={entering === r.slug} className={secondaryButton}>
                    PDV
                  </button>
                  <button onClick={() => setNewOwnerFor(r)} className="rounded-xl px-3 py-2 text-muted ring-1 ring-line hover:text-fg">
                    Link de dono
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </main>

      {creating && (
        <RestaurantSheet
          onClose={() => setCreating(false)}
          onDone={(_link, text) => {
            setCreating(false);
            setNotice(text ?? null);
            void refresh();
          }}
        />
      )}
      {newOwnerFor && (
        <RestaurantSheet
          restaurant={newOwnerFor}
          onClose={() => setNewOwnerFor(null)}
          onDone={(link) => {
            setNewOwnerFor(null);
            if (link) setShare(link);
            void refresh();
          }}
        />
      )}
      {share && <ShareSheet link={share} onClose={() => setShare(null)} />}
    </div>
  );
}

/** "meu restaurante!" → "meu-restaurante" (endereço do cardápio). */
const toSlug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

/** Cadastro de um restaurante novo (com o dono) ou, com `restaurant`, só um novo link de dono. */
function RestaurantSheet({
  restaurant,
  onClose,
  onDone,
}: {
  restaurant?: AdminRestaurant;
  onClose: () => void;
  onDone: (link: ShareLink | null, message?: string) => void;
}) {
  const [ownerUsername, setOwnerUsername] = useState('');
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [ownerPassword, setOwnerPassword] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (restaurant) {
        const res = await api<{ token: string; expiresAt: string }>(`/admin/restaurants/${restaurant.slug}/owner-invite`, {
          method: 'POST',
          body: { name: ownerName, email: ownerEmail },
        });
        onDone(ownerLink(ownerName, restaurant.name, res.token, res.expiresAt));
      } else {
        const res = await api<{ name: string }>('/admin/restaurants', {
          method: 'POST',
          body: { name, slug, ownerName, ownerUsername, ownerPassword },
        });
        onDone(null, `${res.name} cadastrado. Passe ao cliente o usuário "${ownerUsername}" e a senha que você definiu: ele entra como dono e cadastra a equipe.`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={restaurant ? `Novo link de dono · ${restaurant.name}` : 'Novo restaurante'}
      footer={
        <button type="submit" form="restaurant-form" disabled={saving} className={`${primaryButton} w-full py-3`}>
          {saving ? 'Salvando...' : restaurant ? 'Gerar link de dono' : 'Cadastrar restaurante'}
        </button>
      }
    >
      <form id="restaurant-form" onSubmit={submit} className="space-y-4">
        {!restaurant && (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">Nome do restaurante</span>
              <input
                required
                minLength={2}
                maxLength={100}
                autoFocus
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugEdited) setSlug(toSlug(e.target.value));
                }}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">Endereço do cardápio</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">/r/</span>
                <input
                  required
                  minLength={2}
                  maxLength={50}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  title="Letras minúsculas, números e hífens"
                  value={slug}
                  onChange={(e) => {
                    setSlugEdited(true);
                    setSlug(e.target.value.toLowerCase());
                  }}
                  className={inputClass}
                />
              </div>
            </label>
          </>
        )}
        {restaurant && <p className="text-sm text-muted">Use quando o cliente perdeu o acesso, trocou de responsável ou o primeiro link venceu.</p>}
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Nome do dono</span>
          <input
            required
            minLength={2}
            maxLength={100}
            autoFocus={!!restaurant}
            value={ownerName}
            onChange={(e) => {
              setOwnerName(e.target.value);
              if (!usernameEdited) setOwnerUsername(suggestUsername(e.target.value));
            }}
            className={inputClass}
          />
        </label>
        {restaurant ? (
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">E-mail do dono</span>
            <input type="email" required value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className={inputClass} />
            <span className="mt-1 block text-xs text-muted">A pessoa cria a própria senha pelo link e entra com este e-mail.</span>
          </label>
        ) : (
          <>
            <UsernameField
              label="Usuário do dono"
              hint="É o login que você passa ao cliente. Ele entra como dono e cadastra a própria equipe."
              value={ownerUsername}
              onChange={(v) => {
                setUsernameEdited(true);
                setOwnerUsername(v);
              }}
            />
            <PasswordField label="Senha do dono" value={ownerPassword} onChange={setOwnerPassword} />
          </>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-wine-deep px-3 py-2 text-sm text-red-200 ring-1 ring-wine-hover/60">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
