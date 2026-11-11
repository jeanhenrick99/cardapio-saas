/** Erro da API com a mensagem já pronta para mostrar ao usuário. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Chamada à API feita pelo navegador, via proxy /api (o cookie de sessão vai junto). */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      headers: init.body !== undefined ? { 'content-type': 'application/json' } : {},
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Sem conexão com o servidor.', 0);
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { error?: string; issues?: { message: string }[] };
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') window.location.href = '/login';
    throw new ApiError(body.issues?.[0]?.message ?? body.error ?? `Erro ${res.status}`, res.status);
  }
  return body as T;
}
