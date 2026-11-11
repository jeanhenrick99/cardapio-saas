'use client';

import { useEffect, useState } from 'react';
import { formatBRL } from '@cardapio/shared';
import { api, ApiError } from '@/lib/client-api';
import { centsToInput, parseBRL } from '@/lib/panel';
import type { Role, StoreSettings } from '@/lib/types';
import { ImageUploader } from './ImageUploader';
import { card, inputClass, primaryButton } from './styles';

interface Form {
  name: string;
  pickupMinutes: string;
  deliveryMinutes: string;
  minOrder: string;
  tableCount: string;
  serviceFeePercent: string;
  logoUrl: string;
  coverUrl: string;
}

const toForm = (s: StoreSettings): Form => ({
  name: s.name,
  pickupMinutes: String(s.pickupMinutes),
  deliveryMinutes: String(s.deliveryMinutes),
  minOrder: centsToInput(s.minOrderCents),
  tableCount: String(s.tableCount),
  serviceFeePercent: String(s.serviceFeePercent),
  logoUrl: s.logoUrl ?? '',
  coverUrl: s.coverUrl ?? '',
});

export function StoreSettingsForm({ slug, role }: { slug: string; role: Role }) {
  const canEdit = role === 'OWNER';
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<StoreSettings>(`/restaurants/${slug}/settings`)
      .then((s) => {
        setSettings(s);
        setForm(toForm(s));
      })
      .catch((err: Error) => setMessage({ ok: false, text: err.message }));
  }, [slug]);

  async function save(patch: Partial<StoreSettings>, successText: string) {
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api<StoreSettings>(`/restaurants/${slug}/settings`, { method: 'PATCH', body: patch });
      setSettings(updated);
      setForm(toForm(updated));
      setMessage({ ok: true, text: successText });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Não foi possível salvar.' });
    } finally {
      setSaving(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const minOrderCents = parseBRL(form.minOrder);
    if (minOrderCents === null) {
      setMessage({ ok: false, text: 'Pedido mínimo inválido. Use um valor como 30,00.' });
      return;
    }
    void save(
      {
        name: form.name.trim(),
        pickupMinutes: Number(form.pickupMinutes),
        deliveryMinutes: Number(form.deliveryMinutes),
        minOrderCents,
        tableCount: Number(form.tableCount),
        serviceFeePercent: Number(form.serviceFeePercent),
        logoUrl: form.logoUrl.trim() || null,
        coverUrl: form.coverUrl.trim() || null,
      },
      'Configurações salvas.',
    );
  }

  if (!settings || !form) {
    return <p className="text-muted">{message?.text ?? 'Carregando...'}</p>;
  }

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
  const open = settings.acceptingOrders;

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="font-display text-3xl font-semibold">Loja</h1>
      {!canEdit && <p className="text-sm text-muted">Somente o dono pode alterar estas configurações.</p>}

      {/* Aberto / fechado */}
      <div className={`${card} flex flex-wrap items-center justify-between gap-4`}>
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold">
            <span className={`h-3 w-3 rounded-full ${open ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {open ? 'Loja aberta' : 'Loja fechada'}
          </div>
          <p className="text-sm text-muted">
            {open ? 'Os clientes podem fazer pedidos pelo cardápio.' : 'O cardápio continua visível, mas os pedidos estão pausados.'}
          </p>
        </div>
        <button
          disabled={!canEdit || saving}
          onClick={() => void save({ acceptingOrders: !open }, open ? 'Loja fechada para pedidos.' : 'Loja aberta para pedidos.')}
          className={open ? 'rounded-xl px-5 py-2.5 font-semibold text-red-200 ring-1 ring-wine-hover hover:bg-wine-deep disabled:opacity-60' : primaryButton}
        >
          {open ? 'Fechar a loja' : 'Abrir a loja'}
        </button>
      </div>

      <form onSubmit={submit} className={`${card} space-y-5`}>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Nome do restaurante</span>
          <input required minLength={2} maxLength={100} disabled={!canEdit} value={form.name} onChange={set('name')} className={inputClass} />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Retirada (min)</span>
            <input type="number" min={0} max={600} required disabled={!canEdit} value={form.pickupMinutes} onChange={set('pickupMinutes')} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Entrega (min)</span>
            <input type="number" min={0} max={600} required disabled={!canEdit} value={form.deliveryMinutes} onChange={set('deliveryMinutes')} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Pedido mínimo (delivery)</span>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">R$</span>
              <input inputMode="decimal" disabled={!canEdit} value={form.minOrder} onChange={set('minOrder')} className={`${inputClass} pl-10`} />
            </div>
            <span className="mt-1 block text-xs text-muted">Use 0,00 para não ter mínimo.</span>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Quantidade de mesas</span>
            <input type="number" min={0} max={500} required disabled={!canEdit} value={form.tableCount} onChange={set('tableCount')} className={inputClass} />
            <span className="mt-1 block text-xs text-muted">Mesas que aparecem na grade do PDV (1 a N).</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Taxa de serviço (%)</span>
            <input type="number" min={0} max={30} required disabled={!canEdit} value={form.serviceFeePercent} onChange={set('serviceFeePercent')} className={inputClass} />
            <span className="mt-1 block text-xs text-muted">Sugerida no fechamento de mesas e comandas. Use 0 para não cobrar.</span>
          </label>
        </div>

        <ImageUploader
          slug={slug}
          label="Logo"
          value={form.logoUrl}
          onChange={(v) => setForm({ ...form, logoUrl: v })}
          maxSize={512}
          disabled={!canEdit}
        />
        <div>
          <ImageUploader
            slug={slug}
            label="Imagem de capa"
            value={form.coverUrl}
            onChange={(v) => setForm({ ...form, coverUrl: v })}
            maxSize={1600}
            shape="wide"
            disabled={!canEdit}
          />
          <span className="mt-1 block text-xs text-muted">Sem imagem, o cardápio mostra um banner com o nome do restaurante. Lembre de clicar em Salvar.</span>
        </div>

        {canEdit && (
          <div className="flex items-center justify-end gap-3">
            <span className="text-xs text-muted">Pedido mínimo atual: {formatBRL(settings.minOrderCents)}</span>
            <button type="submit" disabled={saving} className={primaryButton}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        )}
      </form>

      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={`rounded-xl px-4 py-3 text-sm ring-1 ${message.ok ? 'text-emerald-300 ring-emerald-700/70' : 'bg-wine-deep text-red-200 ring-wine-hover/60'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
