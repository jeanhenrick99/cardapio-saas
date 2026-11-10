'use client';

import { useRef, useState } from 'react';
import { formatBRL, type MenuProduct } from '@cardapio/shared';
import { buildLine, countInGroup, groupHint, lineUnitCents, missingGroups, toggleOption, type CartLine } from '@/lib/cart';
import { QuantityStepper } from '../ui/QuantityStepper';
import { ProductImage } from './ProductImage';
import { Sheet } from '../ui/Sheet';

interface Props {
  product: MenuProduct;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}

/** Escolha de complementos, observação e quantidade de um produto. */
export function ProductSheet({ product, onClose, onAdd }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const groupRefs = useRef(new Map<string, HTMLFieldSetElement>());

  const missing = missingGroups(product, selected);
  const line = buildLine(product, selected, quantity, notes);
  const total = lineUnitCents(line) * quantity;

  function handleAdd() {
    const first = missing[0];
    if (first) {
      setShowErrors(true);
      groupRefs.current.get(first.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    onAdd(line);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={product.name}
      footer={
        <div className="flex items-center gap-3">
          <QuantityStepper value={quantity} onChange={setQuantity} label="quantidade" />
          <button
            onClick={handleAdd}
            className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl px-4 py-3 font-semibold ${
              missing.length ? 'bg-surface-2 text-muted ring-1 ring-line' : 'bg-wine text-fg ring-1 ring-gold/30 hover:bg-wine-hover'
            }`}
          >
            <span className="truncate">{missing.length ? `Escolha: ${missing[0]!.name}` : 'Adicionar'}</span>
            <span className="shrink-0 whitespace-nowrap tabular-nums">{formatBRL(total)}</span>
          </button>
        </div>
      }
    >
      {product.imageUrl && (
        <ProductImage src={product.imageUrl} alt={product.name} className="mb-4 aspect-video w-full rounded-xl" />
      )}
      {product.description && <p className="mb-4 text-muted">{product.description}</p>}

      {product.optionGroups.map((group) => {
        const count = countInGroup(group, selected);
        const isRadio = group.maxSelect === 1;
        const invalid = showErrors && count < group.minSelect;
        const full = count >= group.maxSelect;
        return (
          <fieldset
            key={group.id}
            ref={(el) => {
              if (el) groupRefs.current.set(group.id, el);
            }}
            className={`mb-5 rounded-2xl border p-3 transition-colors ${
              invalid ? 'border-wine-hover bg-wine-deep/60' : 'border-line bg-bg/40'
            }`}
          >
            <legend className="sr-only">{group.name}</legend>
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <div>
                <div className="font-semibold">{group.name}</div>
                <div className={`text-xs ${invalid ? 'font-medium text-red-300' : 'text-muted'}`}>
                  {invalid ? 'Escolha para continuar' : groupHint(group)}
                </div>
              </div>
              {group.maxSelect > 1 && (
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-gold tabular-nums ring-1 ring-gold-deep/60">
                  {count}/{group.maxSelect}
                </span>
              )}
            </div>

            <div className="divide-y divide-line">
              {group.options.map((option) => {
                const checked = selected.has(option.id);
                const disabled = !checked && full && !isRadio;
                return (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-center gap-3 px-1 py-3 ${disabled ? 'opacity-40' : ''}`}
                  >
                    <input
                      type={isRadio ? 'radio' : 'checkbox'}
                      name={group.id}
                      checked={checked}
                      disabled={disabled}
                      onChange={() => setSelected((s) => toggleOption(group, s, option.id))}
                      onClick={() => {
                        // Rádio não desmarca sozinho: permite desmarcar em grupos opcionais.
                        if (isRadio && checked && group.minSelect === 0) setSelected((s) => toggleOption(group, s, option.id));
                      }}
                      className="h-5 w-5 accent-gold"
                    />
                    <span className="flex-1">{option.name}</span>
                    {option.priceCents > 0 && (
                      <span className="text-sm text-gold tabular-nums">
                        + {formatBRL(option.priceCents)}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Alguma observação?</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 200))}
          rows={2}
          placeholder="Ex.: sem cebola, molho à parte..."
          className="w-full resize-none rounded-xl border border-line bg-surface-2 px-3 py-2 outline-none placeholder:text-muted/60 focus:border-gold"
        />
      </label>
    </Sheet>
  );
}
