'use client';

import { useState } from 'react';
import { addDays, formatBRL, localDay } from '@cardapio/shared';
import type { SalesReportResponse } from '@/lib/types';
import { usePolling } from '@/lib/use-polling';
import { Difference } from '../pdv/CashScreen';
import { card, inputClass } from './styles';

const TYPE_LABELS: Record<string, string> = { mesa: 'Mesa', comanda: 'Comanda', retirada: 'Retirada', delivery: 'Delivery' };

type Preset = { id: string; label: string; range: (today: string) => [string, string] };

const PRESETS: Preset[] = [
  { id: 'hoje', label: 'Hoje', range: (t) => [t, t] },
  { id: 'ontem', label: 'Ontem', range: (t) => [addDays(t, -1), addDays(t, -1)] },
  { id: '7d', label: '7 dias', range: (t) => [addDays(t, -6), t] },
  { id: '30d', label: '30 dias', range: (t) => [addDays(t, -29), t] },
  { id: 'mes', label: 'Este mês', range: (t) => [`${t.slice(0, 8)}01`, t] },
];

const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Relatório de vendas da retaguarda: período, indicadores, vendas por dia, pagamento, tipo, produtos e caixas. */
export function SalesReport({ slug }: { slug: string }) {
  const today = localDay(new Date());
  const [preset, setPreset] = useState<string | null>('7d');
  const [[from, to], setRange] = useState<[string, string]>(PRESETS[2]!.range(today));
  const { data, error } = usePolling<SalesReportResponse>(`/restaurants/${slug}/reports/sales?from=${from}&to=${to}`, 120_000);
  const loading = !data || data.from !== from || data.to !== to;

  function choose(p: Preset) {
    setPreset(p.id);
    setRange(p.range(today));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Relatórios</h1>
          <p className="text-sm text-muted">Vendas recebidas: pedidos de balcão e delivery mais contas de mesa e comanda fechadas.</p>
        </div>
      </div>

      {/* Filtros: uma linha acima de tudo */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-line" role="radiogroup" aria-label="Período">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={preset === p.id}
              onClick={() => choose(p)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${preset === p.id ? 'bg-gold text-black' : 'text-muted hover:text-fg'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          De
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => e.target.value && (setPreset(null), setRange([e.target.value, to]))}
            className={`${inputClass} w-auto py-1.5`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          até
          <input
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => e.target.value && (setPreset(null), setRange([from, e.target.value]))}
            className={`${inputClass} w-auto py-1.5`}
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-wine-deep px-4 py-3 text-sm text-red-200 ring-1 ring-wine-hover/60">
          {error}
        </p>
      )}

      {data && (
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-50' : ''}`} aria-busy={loading}>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi label="Faturamento" value={formatBRL(data.revenueCents)} hint={`${data.receiptsCount} atendimento(s)`} strong />
            <Kpi label="Ticket médio" value={formatBRL(data.averageTicketCents)} hint="por atendimento pago" />
            <Kpi label="Pedidos" value={String(data.ordersCount)} hint={data.canceledCount ? `${data.canceledCount} cancelado(s) · ${formatBRL(data.canceledCents)}` : 'nenhum cancelado'} />
            <Kpi
              label="Taxa de serviço"
              value={formatBRL(data.serviceFeeCents)}
              hint={data.discountCents ? `descontos: ${formatBRL(data.discountCents)}` : 'sem descontos'}
            />
          </div>

          <DailyChart days={data.byDay} />

          <div className="grid gap-6 xl:grid-cols-2">
            <BarList
              title="Por forma de pagamento"
              empty="Nenhum recebimento no período."
              rows={data.byPayment.map((p) => ({ key: p.method, label: p.method, sub: `${p.count}×`, cents: p.cents }))}
            />
            <BarList
              title="Por tipo de pedido"
              empty="Nenhum pedido no período."
              note="Consumo dos pedidos (mesa e comanda sem taxa de serviço e desconto)."
              rows={data.byType.map((t) => ({ key: t.type, label: TYPE_LABELS[t.type] ?? t.type, sub: `${t.count} pedido(s)`, cents: t.cents }))}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className={card} aria-label="Produtos mais vendidos">
              <h2 className="mb-3 font-semibold">Mais vendidos</h2>
              {data.topProducts.length === 0 ? (
                <p className="text-sm text-muted">Nenhum produto vendido no período.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th className="pb-2 font-semibold">#</th>
                      <th className="pb-2 font-semibold">Produto</th>
                      <th className="pb-2 text-right font-semibold">Qtd.</th>
                      <th className="pb-2 text-right font-semibold">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.topProducts.map((p, i) => (
                      <tr key={p.name}>
                        <td className="py-1.5 text-muted tabular-nums">{i + 1}</td>
                        <td className="py-1.5">{p.name}</td>
                        <td className="py-1.5 text-right whitespace-nowrap tabular-nums">{p.quantity}</td>
                        <td className="py-1.5 text-right whitespace-nowrap tabular-nums">{formatBRL(p.cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className={card} aria-label="Fechamentos de caixa">
              <h2 className="mb-3 font-semibold">Fechamentos de caixa</h2>
              {data.registers.length === 0 ? (
                <p className="text-sm text-muted">Nenhum caixa fechado no período. O caixa é aberto e fechado no PDV.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted">
                      <tr>
                        <th className="pb-2 font-semibold">Fechado</th>
                        <th className="pb-2 font-semibold">Por</th>
                        <th className="pb-2 text-right font-semibold">Vendido</th>
                        <th className="pb-2 text-right font-semibold">Gaveta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.registers.map((r) => (
                        <tr key={r.id}>
                          <td className="py-1.5">{dateTime(r.closedAt)}</td>
                          <td className="py-1.5 text-muted">{r.closedBy}</td>
                          <td className="py-1.5 text-right whitespace-nowrap tabular-nums">{formatBRL(r.salesCents)}</td>
                          <td className="py-1.5 text-right">
                            <Difference cents={r.differenceCents} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, strong = false }: { label: string; value: string; hint: string; strong?: boolean }) {
  return (
    <div className={`${card} min-w-0 p-4`}>
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className={`mt-1 font-display text-xl font-semibold whitespace-nowrap tabular-nums sm:text-2xl ${strong ? 'text-gold' : ''}`}>{value}</div>
      <div className="truncate text-xs text-muted">{hint}</div>
    </div>
  );
}

/** Faturamento por dia: barras de uma cor só, ancoradas na base, com dica ao passar o mouse e visão em tabela. */
function DailyChart({ days }: { days: SalesReportResponse['byDay'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(...days.map((d) => d.cents), 0);
  const peak = days.findIndex((d) => d.cents === max && max > 0);
  const labelEvery = Math.ceil(days.length / 10);
  const active = hover ?? null;

  return (
    <section className={card} aria-label="Faturamento por dia">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold">Faturamento por dia</h2>
        <button onClick={() => setAsTable((t) => !t)} className="text-sm text-gold underline-offset-4 hover:underline">
          {asTable ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
              <tr>
                <th className="pb-2 font-semibold">Dia</th>
                <th className="pb-2 text-right font-semibold">Atendimentos</th>
                <th className="pb-2 text-right font-semibold">Faturamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {days.map((d) => (
                <tr key={d.day}>
                  <td className="py-1.5">
                    {shortDay(d.day)} <span className="text-muted">{weekday(d.day)}</span>
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap tabular-nums">{d.count}</td>
                  <td className="py-1.5 text-right whitespace-nowrap tabular-nums">{formatBRL(d.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : max === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Nenhuma venda no período.</p>
      ) : (
        <div className="relative">
          {/* dica (tooltip) do dia sob o mouse */}
          <div className="mb-2 h-10 text-sm" aria-live="polite">
            {active !== null ? (
              <>
                <span className="font-semibold">
                  {shortDay(days[active]!.day)} <span className="font-normal text-muted">{weekday(days[active]!.day)}</span>
                </span>
                <span className="block tabular-nums">
                  {formatBRL(days[active]!.cents)} <span className="text-muted">· {days[active]!.count} atendimento(s)</span>
                </span>
              </>
            ) : (
              <span className="text-muted">
                Maior dia: <span className="text-fg">{shortDay(days[peak]!.day)}</span> com <span className="text-fg tabular-nums">{formatBRL(max)}</span>
              </span>
            )}
          </div>
          <div className="flex h-48 items-end gap-0.5 border-b border-line" onMouseLeave={() => setHover(null)}>
            {days.map((d, i) => (
              <button
                key={d.day}
                type="button"
                aria-label={`${shortDay(d.day)}: ${formatBRL(d.cents)}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="group flex h-full min-w-0 flex-1 items-end outline-none"
              >
                <span
                  className={`w-full rounded-t-[4px] transition-colors ${
                    hover === null || hover === i ? 'bg-gold' : 'bg-gold/35'
                  } group-focus-visible:ring-2 group-focus-visible:ring-fg`}
                  style={{ height: d.cents ? `${Math.max(2, (d.cents / max) * 100)}%` : '0%' }}
                />
              </button>
            ))}
          </div>
          <div className="mt-1 flex gap-0.5 text-[10px] text-muted">
            {days.map((d, i) => (
              <span key={d.day} className="min-w-0 flex-1 text-center">
                {i % labelEvery === 0 ? shortDay(d.day) : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** Lista com barras horizontais: rótulo e valor sempre em texto, a barra só reforça a proporção. */
function BarList({ title, rows, empty, note }: { title: string; rows: { key: string; label: string; sub: string; cents: number }[]; empty: string; note?: string }) {
  const max = Math.max(...rows.map((r) => r.cents), 0);
  const total = rows.reduce((s, r) => s + r.cents, 0);
  return (
    <section className={card} aria-label={title}>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.key} title={`${r.label}: ${formatBRL(r.cents)} (${total ? Math.round((r.cents / total) * 100) : 0}%)`}>
              <div className="mb-1 flex justify-between gap-3 text-sm">
                <span>
                  {r.label} <span className="text-muted">· {r.sub}</span>
                </span>
                <span className="font-semibold tabular-nums">
                  {formatBRL(r.cents)} <span className="font-normal text-muted">{total ? Math.round((r.cents / total) * 100) : 0}%</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface-2">
                <div className="h-2 rounded-full bg-gold" style={{ width: `${max ? (r.cents / max) * 100 : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="mt-3 text-xs text-muted">{note}</p>}
    </section>
  );
}
