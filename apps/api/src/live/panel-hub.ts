import { randomBytes } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { WebSocket } from 'ws';
import { PanelCloseCodes, type PanelEvent } from '@cardapio/shared';

const TOKEN_TTL_MS = 60_000;
const PING_INTERVAL_MS = 25_000;

/**
 * Conexões ao vivo do painel, separadas por restaurante.
 *
 * O painel roda em outro domínio (Vercel) e o cookie de login não chega até aqui
 * numa conexão WebSocket direta. Por isso o painel pede antes, já autenticado pelo
 * cookie, um "passe" (token) aleatório, de uso único e válido por 60 s, e conecta com ele.
 */
export class PanelHub {
  private readonly subscribers = new Map<string, Set<WebSocket>>();
  private readonly tokens = new Map<string, { restaurantId: string; expiresAt: number }>();

  constructor(private readonly log: FastifyBaseLogger) {}

  issueToken(restaurantId: string): { token: string; expiresAt: Date } {
    this.purgeExpired();
    const token = randomBytes(24).toString('base64url');
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    this.tokens.set(token, { restaurantId, expiresAt });
    return { token, expiresAt: new Date(expiresAt) };
  }

  /** Valida e "gasta" o token: ele não pode ser usado duas vezes. */
  private consumeToken(token: string | undefined): string | null {
    if (!token) return null;
    const entry = this.tokens.get(token);
    this.tokens.delete(token);
    if (!entry || entry.expiresAt < Date.now()) return null;
    return entry.restaurantId;
  }

  handleConnection(ws: WebSocket, token: string | undefined): void {
    const restaurantId = this.consumeToken(token);
    if (!restaurantId) {
      ws.close(PanelCloseCodes.UNAUTHORIZED, 'invalid or expired token');
      return;
    }

    let sockets = this.subscribers.get(restaurantId);
    if (!sockets) this.subscribers.set(restaurantId, (sockets = new Set()));
    sockets.add(ws);
    this.send(ws, { type: 'ready' });

    // Proxies e planos gratuitos derrubam conexões paradas: um ping mantém a conexão viva.
    const ping = setInterval(() => ws.readyState === ws.OPEN && ws.ping(), PING_INTERVAL_MS);
    ws.on('close', () => {
      clearInterval(ping);
      sockets.delete(ws);
      if (sockets.size === 0) this.subscribers.delete(restaurantId);
    });
    ws.on('error', (err) => this.log.warn({ err }, 'Erro em conexão ao vivo do painel'));
  }

  /** Avisa todos os painéis abertos DESTE restaurante (nunca de outro). */
  publish(restaurantId: string, event: PanelEvent): void {
    const sockets = this.subscribers.get(restaurantId);
    if (!sockets) return;
    for (const ws of sockets) this.send(ws, event);
  }

  connectionCount(restaurantId: string): number {
    return this.subscribers.get(restaurantId)?.size ?? 0;
  }

  closeAll(): void {
    for (const sockets of this.subscribers.values()) for (const ws of sockets) ws.close(1001, 'server shutting down');
  }

  private send(ws: WebSocket, event: PanelEvent): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [token, entry] of this.tokens) if (entry.expiresAt < now) this.tokens.delete(token);
  }
}
