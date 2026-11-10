'use client';

import { useState } from 'react';
import { formatBRL, type CheckoutInput, type PublicRestaurant } from '@cardapio/shared';
import { cartTotalCents, lineTotalCents, toCheckoutItems, type CartLine } from '@/lib/cart';
import { QuantityStepper } from '../ui/QuantityStepper';
import { Sheet } from '../ui/Sheet';

export interface PlacedOrder {
  number: number;
  totalCents: number;
}

interface Props {
  restaurant: PublicRestaurant;
  table: string | null;
  lines: CartLine[];
  onClose: () => void;
  onChangeQuantity: (key: string, quantity: number) => void;
  onPlaced: (order: PlacedOrder) => void;
}

const PAYMENT_METHODS = ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro'];

const input =
  'w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 outline-none placeholder:text-muted/60 focus:border-gold';

/** Carrinho + finalização do pedido. */
export function CartSheet({ restaurant, table, lines, onClose, onChangeQuantity, onPlaced }: Props) {
  const slug = restaurant.slug;
  const [mode, setMode] = useState<'retirada' | 'delivery'>('retirada');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]!);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = cartTotalCents(lines);
  const isDelivery = !table && mode === 'delivery';
  const missingForMinimum = isDelivery ? Math.max(0, restaurant.minOrderCents - total) : 0;
  // Avisos que impedem o envio (o servidor também confere as mesmas regras).
  const blocked = !restaurant.acceptingOrders
    ? 'O restaurante está fechado no momento.'
    : missingForMinimum > 0
      ? `Faltam ${formatBRL(missingForMinimum)} para o pedido mínimo do delivery (${formatBRL(restaurant.minOrderCents)}).`
      : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const checkout: CheckoutInput = {
      type: table ? 'mesa' : mode,
      ...(table ? { table } : {}),
      ...(!table ? { customer: { name, ...(phone ? { phone } : {}), ...(mode === 'delivery' ? { address } : {}) } } : {}),
      items: toCheckoutItems(lines),
      paymentMethod,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    try {
      const res = await fetch(`/api/public/restaurants/${encodeURIComponent(slug)}/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(checkout),
      });
      const body = (await res.json().catch(() => ({}))) as {
        number?: number;
        totalCents?: number;
        error?: string;
        issues?: { message: string }[];
      };
      if (!res.ok) {
        setError(
          res.status === 429
            ? 'Muitos pedidos em pouco tempo. Aguarde um instante e tente de novo.'
            : (body.issues?.[0]?.message ?? body.error ?? 'Não foi possível enviar o pedido.'),
        );
        return;
      }
      onPlaced({ number: body.number!, totalCents: body.totalCents! });
    } catch {
      setError('Sem conexão. Verifique a internet e tente de novo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Seu pedido"
      footer={
        <button
          type="submit"
          form="checkout"
          disabled={submitting || lines.length === 0 || blocked !== null}
          className="flex w-full items-center justify-between rounded-xl bg-wine px-4 py-3 font-semibold text-fg ring-1 ring-gold/30 hover:bg-wine-hover disabled:opacity-60"
        >
          <span>{submitting ? 'Enviando...' : 'Fazer pedido'}</span>
          <span className="tabular-nums">{formatBRL(total)}</span>
        </button>
      }
    >
      <ul className="mb-6 divide-y divide-line">
        {lines.map((line) => (
          <li key={line.key} className="flex gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{line.name}</div>
              {line.options.length > 0 && (
                <div className="text-sm text-muted">{line.options.map((o) => o.name).join(', ')}</div>
              )}
              {line.notes && <div className="text-sm text-muted italic">“{line.notes}”</div>}
              <div className="mt-1 text-sm font-semibold text-gold tabular-nums">{formatBRL(lineTotalCents(line))}</div>
            </div>
            <QuantityStepper
              size="sm"
              min={0}
              value={line.quantity}
              onChange={(q) => onChangeQuantity(line.key, q)}
              label={`quantidade de ${line.name}`}
            />
          </li>
        ))}
      </ul>

      <form id="checkout" onSubmit={submit} className="space-y-4">
        {table ? (
          <div className="rounded-xl border border-gold-deep/60 bg-gold/10 px-4 py-3 text-gold-soft">
            Pedido para a <strong>mesa {table}</strong>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-1 ring-1 ring-line" role="radiogroup" aria-label="Tipo de pedido">
              {(['retirada', 'delivery'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-lg py-2 text-sm font-semibold ${
                    mode === m ? 'bg-gold text-black shadow' : 'text-muted'
                  }`}
                >
                  {m === 'retirada' ? 'Retirar no local' : 'Delivery'}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">Seu nome</span>
              <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className={input} autoComplete="name" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">Telefone {mode === 'retirada' && <span className="font-normal text-muted">(opcional)</span>}</span>
              <input
                required={mode === 'delivery'}
                type="tel"
                maxLength={30}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={input}
                autoComplete="tel"
                placeholder="(11) 99999-0000"
              />
            </label>
            {mode === 'delivery' && (
              <label className="block">
                <span className="mb-1 block text-sm font-semibold">Endereço de entrega</span>
                <textarea
                  required
                  maxLength={300}
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className={`${input} resize-none`}
                  autoComplete="street-address"
                  placeholder="Rua, número, complemento e bairro"
                />
              </label>
            )}
          </>
        )}

        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Pagamento</span>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={input}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Observações do pedido <span className="font-normal text-muted">(opcional)</span></span>
          <input maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
        </label>

        {blocked && (
          <p role="status" className="rounded-xl border border-gold-deep/60 bg-gold/10 px-4 py-3 text-sm text-gold-soft">
            {blocked}
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-xl border border-wine-hover/60 bg-wine-deep px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
