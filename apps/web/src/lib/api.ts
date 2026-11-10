import type { PublicMenu } from '@cardapio/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:8080';

/** Usado no servidor do Next (Server Components): fala direto com a API. */
export async function getPublicMenu(slug: string): Promise<PublicMenu | null> {
  const res = await fetch(`${API_URL}/public/restaurants/${encodeURIComponent(slug)}/menu`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Falha ao carregar o cardápio (HTTP ${res.status})`);
  return res.json() as Promise<PublicMenu>;
}
