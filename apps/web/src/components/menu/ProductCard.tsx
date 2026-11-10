import { formatBRL, type MenuProduct } from '@cardapio/shared';
import { startingPriceCents } from '@/lib/cart';
import { ProductImage } from './ProductImage';

/** "a partir de" quando o preço final depende das escolhas do cliente. */
export function priceLabel(product: MenuProduct) {
  const start = startingPriceCents(product);
  const from = start !== product.priceCents || product.optionGroups.some((g) => g.options.some((o) => o.priceCents > 0));
  return { from, price: formatBRL(start) };
}

/** Cartão vertical da faixa de destaques: foto quadrada, preço e nome. */
export function HighlightCard({ product, onSelect }: { product: MenuProduct; onSelect: () => void }) {
  const { from, price } = priceLabel(product);
  return (
    <button onClick={onSelect} className="group flex w-36 shrink-0 flex-col justify-start text-left sm:w-44" aria-label={`${product.name}, ${from ? 'a partir de ' : ''}${price}`}>
      <ProductImage
        src={product.imageUrl}
        alt={product.name}
        className="aspect-square w-full rounded-2xl ring-1 ring-line transition group-hover:ring-gold-deep"
      />
      <div className="mt-2 h-4 text-[11px] text-muted">{from ? 'a partir de' : ''}</div>
      <div className="font-semibold text-gold tabular-nums">{price}</div>
      <div className="line-clamp-2 text-sm text-muted group-hover:text-fg">{product.name}</div>
    </button>
  );
}

/** Cartão da grade de categorias. */
export function ProductCard({ product, onSelect }: { product: MenuProduct; onSelect: () => void }) {
  const { from, price } = priceLabel(product);
  return (
    <button
      onClick={onSelect}
      className="flex h-full w-full items-stretch gap-3 rounded-xl bg-surface p-4 text-left ring-1 ring-line transition hover:ring-gold-deep"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="line-clamp-2 font-semibold">{product.name}</div>
        {product.description && <div className="mt-1 line-clamp-2 text-sm text-muted">{product.description}</div>}
        <div className="mt-auto pt-3 tabular-nums">
          {from && <span className="text-xs text-muted">a partir de </span>}
          <span className="font-semibold text-gold">{price}</span>
        </div>
      </div>
      {product.imageUrl && <ProductImage src={product.imageUrl} alt={product.name} className="h-20 w-20 shrink-0 rounded-lg" />}
    </button>
  );
}
