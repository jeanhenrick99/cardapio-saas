/** Mini cliente da API para os scripts de desenvolvimento: faz login com o usuário demo. */
import { env } from '../env';
import { DEMO_USER } from './demo';

export const API_URL = `http://localhost:${env.PORT}`;

export async function loginAsDemo(): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: DEMO_USER.email, password: DEMO_USER.password }),
  });
  const body = (await res.json()) as { token?: string; error?: string };
  if (!res.ok || !body.token) {
    console.error(`✖ Login do usuário demo falhou (${body.error ?? res.status}). Rodou "npm run db:seed"?`);
    process.exit(1);
  }
  return body.token;
}

export async function api<T>(token: string, method: string, path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { method, headers: { authorization: `Bearer ${token}` } });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    console.error(`✖ HTTP ${res.status}: ${body.error ?? JSON.stringify(body)}`);
    process.exit(1);
  }
  return body;
}
