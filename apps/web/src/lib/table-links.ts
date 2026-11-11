/** Limites da folha de QR Codes (evita gerar milhares por engano). */
export const MAX_TABLES = 200;

/**
 * Normaliza o endereço base do site digitado pelo usuário.
 * Aceita "192.168.0.10:3000" ou "meurestaurante.com" e devolve a origem com protocolo.
 * Retorna null se não for um endereço válido.
 */
export function normalizeBaseUrl(input: string): string | null {
  const raw = input.trim().replace(/\/+$/, '');
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Endereços que só abrem no próprio computador (não funcionam no celular do cliente). */
export function isLocalOnly(baseUrl: string): boolean {
  try {
    const { hostname } = new URL(baseUrl);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost');
  } catch {
    return false;
  }
}

export interface TableLink {
  /** null = QR geral (retirada/delivery), sem mesa. */
  table: string | null;
  url: string;
}

/** Links do cardápio: um por mesa, a partir de `from`, mais o geral (opcional). */
export function buildTableLinks(
  baseUrl: string,
  slug: string,
  opts: { from: number; count: number; includeGeneral: boolean },
): TableLink[] {
  const menuUrl = `${baseUrl}/r/${encodeURIComponent(slug)}`;
  const count = Math.max(0, Math.min(MAX_TABLES, Math.floor(opts.count)));
  const from = Math.max(1, Math.floor(opts.from));
  const tables = Array.from({ length: count }, (_, i) => {
    const table = String(from + i);
    return { table, url: `${menuUrl}?mesa=${table}` };
  });
  return opts.includeGeneral ? [{ table: null, url: menuUrl }, ...tables] : tables;
}
