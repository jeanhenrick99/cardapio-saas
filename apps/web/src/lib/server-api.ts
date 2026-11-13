import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { accessFromSession, type RestaurantAccess } from './access';
import type { Me } from './types';

const API_URL = process.env.API_URL ?? 'http://localhost:8080';

/**
 * Chamada à API feita pelo servidor do Next (Server Components),
 * repassando o cookie de sessão do navegador.
 */
async function serverFetch(path: string): Promise<Response> {
  const session = (await cookies()).get('session');
  return fetch(`${API_URL}${path}`, {
    cache: 'no-store',
    headers: session ? { cookie: `session=${session.value}` } : {},
  });
}

/** Usuário logado, ou null se não houver sessão válida. (Uma busca por requisição, mesmo chamado várias vezes.) */
export const getMe = cache(async (): Promise<Me | null> => {
  const res = await serverFetch('/auth/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Falha ao carregar o usuário (HTTP ${res.status})`);
  return res.json() as Promise<Me>;
});

/**
 * Acesso do usuário logado a um restaurante: como membro (dono/funcionário) ou, para o
 * administrador da plataforma, em modo suporte com os poderes de dono. null = sem acesso.
 * Layouts e páginas usam SEMPRE esta função para decidir o papel (nunca `me.restaurants` direto),
 * senão o modo suporte vira "funcionário" e as telas ficam somente leitura.
 */
export const getRestaurantAccess = cache(async (slug: string): Promise<RestaurantAccess | null> => {
  const me = await getMe();
  if (!me) return null;
  const access = accessFromSession(me, slug);
  if (access !== 'support') return access;
  const res = await serverFetch(`/admin/restaurants/${encodeURIComponent(slug)}`);
  if (!res.ok) return null;
  const restaurant = (await res.json()) as { name: string };
  return { name: restaurant.name, role: 'OWNER', support: true };
});

/** Endereço WebSocket da conexão ao vivo (http→ws, https→wss), derivado do API_URL do servidor. */
export function liveUrl(): string {
  return `${API_URL.replace(/^http/, 'ws')}/panel/live`;
}
