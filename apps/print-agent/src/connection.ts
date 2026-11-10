import {
  CloseCodes,
  PROTOCOL_VERSION,
  parseServerMessage,
  type AgentMessage,
  type ServerMessage,
} from '@cardapio/shared';
import { log } from './log';

export interface ConnectionOptions {
  url: string;
  token: string;
  agentVersion: string;
  printers: string[];
  heartbeatMs?: number;
  /** Chamado após o servidor aceitar o token (mensagem `welcome`). */
  onReady: () => void;
  onMessage: (msg: ServerMessage) => void;
}

/**
 * Conexão WebSocket resiliente com o servidor:
 * autenticação via `hello`, heartbeat periódico e reconexão
 * automática com backoff exponencial + jitter (1s, 2s, 4s... até 30s).
 */
export class ServerConnection {
  private ws: WebSocket | null = null;
  private ready = false;
  private attempt = 0;
  private stopped = false;
  private heartbeat: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private readonly opts: ConnectionOptions) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.clearHeartbeat();
    this.ws?.close(1000, 'agent stopping');
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** Envia uma mensagem. Retorna `false` se não houver conexão autenticada. */
  send(msg: AgentMessage): boolean {
    if (!this.ready || !this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  private connect(): void {
    log.info(`Conectando em ${this.opts.url}...`);
    const ws = new WebSocket(this.opts.url);
    this.ws = ws;

    ws.addEventListener('open', () => {
      const hello: AgentMessage = {
        type: 'hello',
        token: this.opts.token,
        agentVersion: this.opts.agentVersion,
        protocolVersion: PROTOCOL_VERSION,
        printers: this.opts.printers,
      };
      ws.send(JSON.stringify(hello));
    });

    ws.addEventListener('message', (event) => {
      const msg = parseServerMessage(String(event.data));
      if (!msg) {
        log.warn(`Mensagem inválida do servidor ignorada: ${String(event.data).slice(0, 200)}`);
        return;
      }
      if (msg.type === 'welcome') {
        this.ready = true;
        this.attempt = 0;
        log.info(`🟢 Conectado ao servidor (agente ${msg.agentId})`);
        this.startHeartbeat();
        this.opts.onReady();
        return;
      }
      if (msg.type === 'error') log.error(`Servidor: [${msg.code}] ${msg.message}`);
      this.opts.onMessage(msg);
    });

    ws.addEventListener('close', (event) => {
      const wasReady = this.ready;
      this.ready = false;
      this.ws = null;
      this.clearHeartbeat();
      if (event.code === CloseCodes.UNAUTHORIZED) log.error('Token recusado pelo servidor. Verifique o "token" no agent.config.json.');
      else if (event.code === CloseCodes.REPLACED) log.warn('Outra instância do agente conectou com o mesmo token.');
      else if (wasReady) log.warn(`🔴 Conexão perdida (código ${event.code}).`);
      if (!this.stopped) this.scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      // O evento `close` sempre vem em seguida; a reconexão é tratada lá.
    });
  }

  private scheduleReconnect(): void {
    const base = Math.min(30_000, 1_000 * 2 ** this.attempt);
    const delay = Math.round(base / 2 + Math.random() * (base / 2));
    this.attempt++;
    log.info(`Nova tentativa de conexão em ${(delay / 1000).toFixed(1)}s`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeat = setInterval(() => {
      this.send({ type: 'heartbeat', at: new Date().toISOString() });
    }, this.opts.heartbeatMs ?? 15_000);
  }

  private clearHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }
}
