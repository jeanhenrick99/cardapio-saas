import type { CartItem, MenuOptionGroup, MenuProduct } from '@cardapio/shared';

/**
 * Lógica do carrinho, separada da interface para ser testável.
 * Os valores aqui são só para exibição: quem calcula o total de verdade é o servidor.
 */

export interface CartLineOption {
  id: string;
  name: string;
  priceCents: number;
}

export interface CartLine {
  key: string;
  productId: string;
  name: string;
  basePriceCents: number;
  quantity: number;
  options: CartLineOption[];
  notes?: string;
}

/** Itens iguais (mesmo produto, opções e observação) viram uma linha só com quantidade somada. */
export function lineKey(productId: string, optionIds: string[], notes = ''): string {
  return [productId, [...optionIds].sort().join(','), notes.trim().toLowerCase()].join('|');
}

export const lineUnitCents = (line: Pick<CartLine, 'basePriceCents' | 'options'>) =>
  line.basePriceCents + line.options.reduce((sum, o) => sum + o.priceCents, 0);

export const lineTotalCents = (line: CartLine) => lineUnitCents(line) * line.quantity;

export const cartTotalCents = (lines: CartLine[]) => lines.reduce((sum, l) => sum + lineTotalCents(l), 0);

export const cartCount = (lines: CartLine[]) => lines.reduce((sum, l) => sum + l.quantity, 0);

/**
 * Marca/desmarca uma opção respeitando o máximo do grupo:
 * - máximo 1: funciona como botão de rádio (troca a escolha)
 * - máximo N: alterna, e ignora novas escolhas quando o limite já foi atingido
 */
export function toggleOption(group: MenuOptionGroup, selected: ReadonlySet<string>, optionId: string): Set<string> {
  const next = new Set(selected);
  const inGroup = group.options.filter((o) => next.has(o.id));

  if (next.has(optionId)) {
    next.delete(optionId);
    return next;
  }
  if (group.maxSelect === 1) {
    inGroup.forEach((o) => next.delete(o.id));
    next.add(optionId);
    return next;
  }
  if (inGroup.length < group.maxSelect) next.add(optionId);
  return next;
}

export const countInGroup = (group: MenuOptionGroup, selected: ReadonlySet<string>) =>
  group.options.filter((o) => selected.has(o.id)).length;

/** Grupos que ainda não atingiram o mínimo. Vazio = pode adicionar ao carrinho. */
export function missingGroups(product: MenuProduct, selected: ReadonlySet<string>): MenuOptionGroup[] {
  return product.optionGroups.filter((g) => countInGroup(g, selected) < g.minSelect);
}

/** Texto de ajuda do grupo: "Obrigatório · escolha 1", "Opcional · até 4"... */
export function groupHint(group: MenuOptionGroup): string {
  const { minSelect: min, maxSelect: max } = group;
  if (min === 0) return max === 1 ? 'Opcional' : `Opcional · até ${max}`;
  if (min === max) return `Obrigatório · escolha ${min}`;
  return `Obrigatório · de ${min} a ${max}`;
}

export function buildLine(product: MenuProduct, selected: ReadonlySet<string>, quantity: number, notes?: string): CartLine {
  const options = product.optionGroups.flatMap((g) => g.options.filter((o) => selected.has(o.id)));
  const trimmed = notes?.trim() || undefined;
  return {
    key: lineKey(product.id, options.map((o) => o.id), trimmed),
    productId: product.id,
    name: product.name,
    basePriceCents: product.priceCents,
    quantity,
    options: options.map(({ id, name, priceCents }) => ({ id, name, priceCents })),
    ...(trimmed ? { notes: trimmed } : {}),
  };
}

export function addLine(lines: CartLine[], line: CartLine): CartLine[] {
  const existing = lines.find((l) => l.key === line.key);
  if (!existing) return [...lines, line];
  return lines.map((l) => (l.key === line.key ? { ...l, quantity: Math.min(50, l.quantity + line.quantity) } : l));
}

export function setQuantity(lines: CartLine[], key: string, quantity: number): CartLine[] {
  if (quantity <= 0) return lines.filter((l) => l.key !== key);
  return lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, quantity) } : l));
}

/** O que vai para a API: só IDs e quantidades, nunca preços. */
export function toCheckoutItems(lines: CartLine[]): CartItem[] {
  return lines.map((l) => ({
    productId: l.productId,
    quantity: l.quantity,
    optionIds: l.options.map((o) => o.id),
    ...(l.notes ? { notes: l.notes } : {}),
  }));
}

/** Menor preço possível do produto: base + opções mais baratas dos grupos obrigatórios. */
export function startingPriceCents(product: MenuProduct): number {
  return product.optionGroups.reduce((sum, g) => {
    const cheapest = g.options
      .map((o) => o.priceCents)
      .sort((a, b) => a - b)
      .slice(0, g.minSelect);
    return sum + cheapest.reduce((s, p) => s + p, 0);
  }, product.priceCents);
}

/**
 * O carrinho fica salvo no celular. Quando o cliente volta, o cardápio pode
 * ter mudado: remove itens que sumiram e atualiza os preços.
 */
export function reconcileLines(lines: CartLine[], menu: { categories: { products: MenuProduct[] }[] }): CartLine[] {
  const products = new Map(menu.categories.flatMap((c) => c.products).map((p) => [p.id, p]));
  return lines.flatMap((line) => {
    const product = products.get(line.productId);
    if (!product) return [];
    const options = new Map(product.optionGroups.flatMap((g) => g.options).map((o) => [o.id, o]));
    if (line.options.some((o) => !options.has(o.id))) return [];
    return [
      {
        ...line,
        name: product.name,
        basePriceCents: product.priceCents,
        options: line.options.map((o) => ({ ...o, ...options.get(o.id)! })),
      },
    ];
  });
}

/** Valida o formato do que veio do localStorage (pode estar corrompido ou ser de uma versão antiga). */
export function parseStoredLines(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (l): l is CartLine =>
      typeof l === 'object' &&
      l !== null &&
      typeof l.key === 'string' &&
      typeof l.productId === 'string' &&
      typeof l.quantity === 'number' &&
      Array.isArray(l.options),
  );
}
