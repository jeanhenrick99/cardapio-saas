'use client';

import { formatBRL } from '@cardapio/shared';
import { lineTotalCents, setQuantity, type CartLine } from '@/lib/cart';
import { QuantityStepper } from '../ui/QuantityStepper';

/** Itens do lançamento em montagem, com quantidade ajustável (0 remove). */
export function CartLines({ lines, onChange, empty = 'Toque nos produtos para adicionar.' }: { lines: CartLine[]; onChange: (lines: CartLine[]) => void; empty?: string }) {
  if (lines.length === 0) {
    return <p className="rounded-xl px-3 py-4 text-center text-sm text-muted ring-1 ring-line">{empty}</p>;
  }
  return (
    <ul className="max-h-72 divide-y divide-line overflow-y-auto">
      {lines.map((line) => (
        <li key={line.key} className="flex items-center gap-2 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{line.name}</div>
            {line.options.length > 0 && <div className="truncate text-xs text-muted">{line.options.map((o) => o.name).join(', ')}</div>}
            {line.notes && <div className="truncate text-xs text-gold-soft">“{line.notes}”</div>}
            <div className="text-xs font-semibold text-gold tabular-nums">{formatBRL(lineTotalCents(line))}</div>
          </div>
          <QuantityStepper
            size="sm"
            min={0}
            value={line.quantity}
            onChange={(q) => onChange(setQuantity(lines, line.key, q))}
            label={`quantidade de ${line.name}`}
          />
        </li>
      ))}
    </ul>
  );
}
