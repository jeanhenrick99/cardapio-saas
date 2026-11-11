import 'server-only';
import { cookies } from 'next/headers';
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

/** Usuário logado, ou null se não houver sessão válida. */
export async function getMe(): Promise<Me | null> {
  const res = await serverFetch('/auth/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Falha ao carregar o usuário (HTTP ${res.status})`);
  return res.json() as Promise<Me>;
}

/** Endereço WebSocket da conexão ao vivo (http→ws, https→wss), derivado do API_URL do servidor. */
export function liveUrl(): string {
  return `${API_URL.replace(/^http/, 'ws')}/panel/live`;
}
