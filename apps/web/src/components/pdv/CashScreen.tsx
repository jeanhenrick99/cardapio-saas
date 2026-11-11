'use client';

import { useState } from 'react';
import { cashMovementLabel, formatBRL, type CashMovementKind } from '@cardapio/shared';
import { api, ApiError } from '@/lib/client-api';
import { useLiveEvents, usePollingInterval } from '@/lib/live';
import { centsToInput, parseBRL, timeAgo } from '@/lib/panel';
import type { CashRegisterDetail, CashResponse } from '@/lib/types';
import { usePolling } from '@/lib/use-polling';
import { card, inputClass, primaryButton, secondaryButton } from '../panel/styles';
import { Sheet } from '../ui/Sheet';

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Diferença do caixa: sobra, falta ou "confere", sempre com texto (não só cor). */
export function Difference({ cents }: { cents: number | null }) {
  if (cents === null) return <span className="text-muted">—</span>;
  if (cents === 0) return <span className="font-semibold text-emerald-300">✓ Confere</span>;
  return cents > 0 ? (
    <span className="font-semibold text-gold-soft tabular-nums">▲ Sobra {formatBRL(cents)}</span>
  ) : (
    <span className="font-semibold text-red-300 tabular-nums">▼ Falta {formatBRL(-cents)}</span>
  );
}

/** Caixa do PDV: abertura com troco, vendas por forma de pagamento, sangria/suprimento e fechamento com conferência. */
export function CashScreen({ slug }: { slug: string }) {
  const { data, error, refresh } = usePolling<CashResponse>(`/restaurants/${slug}/cash`, usePollingInterval());
  const [movement, setMovement] = useState<CashMovementKind | null>(null);
  const [closing, setClosing] = useState(false);
  const [lastClosed, setLastClosed] = useState<CashRegisterDetail | null>(null);
  useLiveEvents(
    (e) => (e.type === 'cash_changed' || e.type === 'order_created' || e.type === 'order_status' || e.type === 'tabs_changed') && void refresh(),
  );

  if (!data) return <p className="text-muted">{error ?? 'Carregando...'}</p>;
  const current = data.current;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="font-display text-2xl font-semibold">Caixa</h1>

      {lastClosed && <ClosedReceipt register={lastClosed} onDismiss={() => setLastClosed(null)} />}

      {current ? (
        <>
          <div className={`${card} flex flex-wrap items-center justify-between gap-4`}>
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold">
                <span className="h-3 w-3 rounded-full bg-emerald-400" /> Caixa aberto
              </div>
              <p className="text-sm text-muted">
                Aberto {timeAgo(current.openedAt)} por {current.openedBy} · troco inicial {formatBRL(current.openingCents)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setMovement('SANGRIA')} className={secondaryButton}>
                Sangria
              </button>
              <button onClick={() => setMovement('SUPRIMENTO')} className={secondaryButton}>
                Suprimento
              </button>
              <button onClick={() => setClosing(true)} className={primaryButton}>
                Fechar caixa
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Vendido neste caixa" value={formatBRL(current.summary.salesCents)} hint={`${current.summary.salesCount} venda(s)`} />
            <Stat label="Em dinheiro" value={formatBRL(current.summary.cashSalesCents)} hint="vendas pagas em dinheiro" />
            <Stat label="Dinheiro esperado na gaveta" value={formatBRL(current.summary.expectedCashCents)} hint="troco + dinheiro + suprimentos − sangrias" strong />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <section className={card} aria-label="Vendas por forma de pagamento">
              <h2 className="mb-3 font-semibold">Por forma de pagamento</h2>
              {current.summary.byPayment.length === 0 ? (
                <p className="text-sm text-muted">Nenhuma venda ainda. Pedidos de balcão e delivery e contas de mesa fechadas entram aqui.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {current.summary.byPayment.map((p) => (
                    <li key={p.method} className="flex justify-between py-2">
                      <span>
                        {p.method} <span className="text-muted">· {p.count}</span>
                      </span>
                      <span className="font-semibold tabular-nums">{formatBRL(p.cents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={card} aria-label="Sangrias e suprimentos">
              <h2 className="mb-3 font-semibold">Sangrias e suprimentos</h2>
              {current.movements.length === 0 ? (
                <p className="text-sm text-muted">Nenhuma movimentação.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {current.movements.map((m) => (
                    <li key={m.id} className="flex items-start justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="font-semibold">{cashMovementLabel[m.kind]}</span>
                        <span className="block truncate text-xs text-muted">
                          {m.reason} · {m.createdBy} · {timeAgo(m.createdAt)}
                        </span>
                      </span>
                      <span className={`shrink-0 font-semibold tabular-nums ${m.kind === 'SANGRIA' ? 'text-red-300' : 'text-emerald-300'}`}>
                        {m.kind === 'SANGRIA' ? '−' : '+'}
                        {formatBRL(m.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : (
        <OpenForm slug={slug} onOpened={refresh} />
      )}

      {data.recent.length > 0 && (
        <section aria-label="Últimos fechamentos">
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-gold-soft uppercase">Últimos fechamentos</h2>
          <div className="overflow-x-auto rounded-2xl ring-1 ring-line">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Fechado</th>
                  <th className="px-3 py-2 font-semibold">Por</th>
                  <th className="px-3 py-2 text-right font-semibold">Esperado</th>
                  <th className="px-3 py-2 text-right font-semibold">Contado</th>
                  <th className="px-3 py-2 text-right font-semibold">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {data.recent.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">{r.closedAt ? dateTime(r.closedAt) : '—'}</td>
                    <td className="px-3 py-2 text-muted">{r.closedBy}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBRL(r.expectedCashCents ?? 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBRL(r.countedCents ?? 0)}</td>
                    <td className="px-3 py-2 text-right">
                      <Difference cents={r.differenceCents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {movement && current && (
        <MovementSheet
          slug={slug}
          kind={movement}
          onClose={() => setMovement(null)}
          onDone={() => {
            setMovement(null);
            void refresh();
          }}
        />
      )}
      {closing && current && (
        <CloseCashSheet
          slug={slug}
          register={current}
          onClose={() => setClosing(false)}
          onClosed={(closed) => {
            setClosing(false);
            setLastClosed(closed);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, hint, strong = false }: { label: string; value: string; hint: string; strong?: boolean }) {
  return (
    <div className={`${card} ${strong ? 'ring-gold-deep' : ''}`}>
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className={`mt-1 font-display text-2xl font-semibold tabular-nums ${strong ? 'text-gold' : ''}`}>{value}</div>
      <div className="text-xs text-muted">{hint}</div>
    </div>
  );
}

function MoneyInput({ value, onChange, label, autoFocus }: { value: string; onChange: (v: string) => void; label: string; autoFocus?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">R$</span>
        <input inputMode="decimal" autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} pl-10`} />
      </div>
    </label>
  );
}

function ErrorBox({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="rounded-xl bg-wine-deep px-3 py-2 text-sm text-red-200 ring-1 ring-wine-hover/60">
      {text}
    </p>
  );
}

function OpenForm({ slug, onOpened }: { slug: string; onOpened: () => void }) {
  const [opening, setOpening] = useState(centsToInput(0));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const openingCents = parseBRL(opening);
    if (openingCents === null) return setError('Valor inválido. Use um valor como 100,00.');
    setSaving(true);
    setError(null);
    try {
      await api(`/restaurants/${slug}/cash/open`, { method: 'POST', body: { openingCents } });
      onOpened();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível abrir o caixa.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className={`${card} max-w-md space-y-4`}>
      <div>
        <div className="flex items-center gap-2 text-lg font-semibold">
          <span className="h-3 w-3 rounded-full bg-red-400" /> Caixa fechado
        </div>
        <p className="text-sm text-muted">Abra o caixa no início do expediente. As vendas feitas com o caixa fechado não entram em nenhum fechamento.</p>
      </div>
      <MoneyInput label="Troco inicial (dinheiro na gaveta)" value={opening} onChange={setOpening} autoFocus />
      <ErrorBox text={error} />
      <button type="submit" disabled={saving} className={`${primaryButton} w-full py-3`}>
        {saving ? 'Abrindo...' : 'Abrir caixa'}
      </button>
    </form>
  );
}

function MovementSheet({ slug, kind, onClose, onDone }: { slug: string; kind: CashMovementKind; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function confirm() {
    const amountCents = parseBRL(amount);
    if (!amountCents) return setError('Informe um valor maior que zero.');
    if (reason.trim().length < 2) return setError('Informe o motivo.');
    setSaving(true);
    setError(null);
    try {
      await api(`/restaurants/${slug}/cash/movements`, { method: 'POST', body: { kind, amountCents, reason: reason.trim() } });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível registrar.');
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={cashMovementLabel[kind]}
      footer={
        <button onClick={() => void confirm()} disabled={saving} className={`${primaryButton} w-full py-3`}>
          {saving ? 'Registrando...' : `Registrar ${cashMovementLabel[kind].toLowerCase()}`}
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {kind === 'SANGRIA' ? 'Retirada de dinheiro da gaveta (ex.: depósito, pagamento de fornecedor).' : 'Entrada de dinheiro na gaveta (ex.: reforço de troco).'}
        </p>
        <MoneyInput label="Valor" value={amount} onChange={setAmount} autoFocus />
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Motivo</span>
          <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder={kind === 'SANGRIA' ? 'Ex.: depósito no banco' : 'Ex.: moedas para troco'} />
        </label>
        <ErrorBox text={error} />
      </div>
    </Sheet>
  );
}

function CloseCashSheet({
  slug,
  register,
  onClose,
  onClosed,
}: {
  slug: string;
  register: CashRegisterDetail;
  onClose: () => void;
  onClosed: (r: CashRegisterDetail) => void;
}) {
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const countedCents = counted.trim() ? parseBRL(counted) : null;
  const expected = register.summary.expectedCashCents;

  async function confirm() {
    if (countedCents === null) return setError('Informe quanto dinheiro foi contado na gaveta.');
    setSaving(true);
    setError(null);
    try {
      onClosed(await api<CashRegisterDetail>(`/restaurants/${slug}/cash/close`, { method: 'POST', body: { countedCents, notes: notes.trim() || undefined } }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível fechar o caixa.');
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Fechar caixa"
      footer={
        <button onClick={() => void confirm()} disabled={saving} className={`${primaryButton} w-full py-3`}>
          {saving ? 'Fechando...' : 'Confirmar fechamento'}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5 rounded-xl bg-surface-2 p-3 text-sm ring-1 ring-line">
          <Row label="Troco inicial" cents={register.summary.openingCents} />
          <Row label="Vendas em dinheiro" cents={register.summary.cashSalesCents} />
          {register.summary.suprimentoCents > 0 && <Row label="Suprimentos" cents={register.summary.suprimentoCents} />}
          {register.summary.sangriaCents > 0 && <Row label="Sangrias" cents={-register.summary.sangriaCents} />}
          <div className="flex justify-between border-t border-line pt-1.5 font-semibold text-gold">
            <span>Esperado na gaveta</span>
            <span className="tabular-nums">{formatBRL(expected)}</span>
          </div>
        </div>
        <MoneyInput label="Dinheiro contado na gaveta" value={counted} onChange={setCounted} autoFocus />
        {countedCents !== null && (
          <p className="text-sm">
            Diferença: <Difference cents={countedCents - expected} />
          </p>
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">
            Observação <span className="font-normal text-muted">(opcional)</span>
          </span>
          <input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </label>
        <p className="text-xs text-muted">Pix e cartões não entram na gaveta: aparecem no resumo do fechamento e nos relatórios.</p>
        <ErrorBox text={error} />
      </div>
    </Sheet>
  );
}

function Row({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="tabular-nums">{cents < 0 ? `−${formatBRL(-cents)}` : formatBRL(cents)}</span>
    </div>
  );
}

/** Resumo exibido logo após o fechamento. */
function ClosedReceipt({ register, onDismiss }: { register: CashRegisterDetail; onDismiss: () => void }) {
  const s = register.summary;
  return (
    <section aria-label="Caixa fechado" className={`${card} space-y-3 ring-gold-deep`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Caixa fechado</h2>
          <p className="text-sm text-muted">
            {dateTime(register.openedAt)} → {register.closedAt ? dateTime(register.closedAt) : ''} · {register.closedBy}
          </p>
        </div>
        <button onClick={onDismiss} className="text-sm text-muted hover:text-fg">
          Ok
        </button>
      </div>
      <div className="grid gap-4 text-sm sm:grid-cols-2">
        <ul className="space-y-1">
          {s.byPayment.map((p) => (
            <li key={p.method} className="flex justify-between">
              <span>{p.method}</span>
              <span className="tabular-nums">{formatBRL(p.cents)}</span>
            </li>
          ))}
          <li className="flex justify-between border-t border-line pt-1 font-semibold">
            <span>Total vendido</span>
            <span className="tabular-nums">{formatBRL(s.salesCents)}</span>
          </li>
        </ul>
        <ul className="space-y-1">
          <li className="flex justify-between">
            <span>Esperado na gaveta</span>
            <span className="tabular-nums">{formatBRL(s.expectedCashCents)}</span>
          </li>
          <li className="flex justify-between">
            <span>Contado</span>
            <span className="tabular-nums">{formatBRL(s.countedCents ?? 0)}</span>
          </li>
          <li className="flex justify-between border-t border-line pt-1">
            <span>Diferença</span>
            <Difference cents={s.differenceCents} />
          </li>
        </ul>
      </div>
    </section>
  );
}
