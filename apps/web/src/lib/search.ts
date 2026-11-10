import type { MenuCategory } from '@cardapio/shared';

/** Minúsculas e sem acentos: "Açaí" e "acai" viram a mesma coisa. */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/**
 * Filtra o cardápio pelo texto da busca (nome ou descrição do produto,
 * ou nome da categoria). Todas as palavras precisam aparecer.
 */
export function filterMenu(categories: MenuCategory[], query: string): MenuCategory[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return categories;
  return categories
    .map((c) => ({
      ...c,
      products: c.products.filter((p) => {
        const haystack = normalize(`${p.name} ${p.description ?? ''} ${c.name}`);
        return words.every((w) => haystack.includes(w));
      }),
    }))
    .filter((c) => c.products.length > 0);
}
