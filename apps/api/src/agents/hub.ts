import type { Prisma, PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type { WebSocket } from 'ws';
import {
  CloseCodes,
  parseAgentMessage,
  type AgentAck,
  type AgentHello,
  type Order,
  type ServerMessage,
} from '@cardapio/shared';
import { hashToken } from '../auth/tokens';
import type { PanelHub } from '../live/panel-hub';

interface Session {
  agentId: string;
  restaurantId: string;
  ws: WebSocket;
}

const HELLO_TIMEOUT_MS = 5_000;

/**
 * Gerencia as conexões WebSocket dos agentes de impressão.
 *
 * - Autentica pelo token (comparando o hash salvo no banco).
 * - Mantém no máximo um agente ativo por restaurante.
 * - Envia jobs novos e, ao conectar, reenvia tudo que não foi confirmado.
 * - Registra os ACKs no banco, sempre filtrando pelo restaurante da sessão
 *   (um agente nunca altera jobs de outro restaurante).
 */
export class AgentHub {
  private readonly byRestaurant = new Map<string, Session>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly log: FastifyBaseLogger,
    /** Avisa o painel do restaurante em tempo real (agente conectou, impressão confirmada...). */
    readonly panel: PanelHub,
  ) {}

  isOnline(agentId: string): boolean {
    for (const s of this.byRestaurant.values()) if (s.agentId === agentId) return true;
    return false;
  }

  handleConnection(ws: WebSocket): void {
    let session: Session | null = null;
    const helloTimeout = setTimeout(() => ws.close(CloseCodes.UNAUTHORIZED, 'hello timeout'), HELLO_TIMEOUT_MS);

    ws.on('message', (data) => {
      void (async () => {
        const msg = parseAgentMessage(data.toString());
        if (!msg) {
          this.log.warn('Mensagem inválida de agente ignorada');
          return;
        }
        if (!session) {
          if (msg.type !== 'hello') return ws.close(CloseCodes.UNAUTHORIZED, 'expected hello');
          session = await this.authenticate(ws, msg);
          if (session) clearTimeout(helloTimeout);
          return;
        }
        if (msg.type === 'heartbeat') {
          await this.prisma.agent.update({ where: { id: session.agentId }, data: { lastSeenAt: new Date() } });
        } else if (msg.type === 'ack') {
          await this.applyAck(session, msg);
        }
      })().catch((err: unknown) => this.log.error({ err }, 'Erro ao processar mensagem do agente'));
    });

    ws.on('close', () => {
      clearTimeout(helloTimeout);
      if (session && this.byRestaurant.get(session.restaurantId)?.ws === ws) {
        this.byRestaurant.delete(session.restaurantId);
        this.panel.publish(session.restaurantId, { type: 'agents_changed' });
        this.log.info({ agentId: session.agentId }, '🔴 Agente desconectado');
      }
    });
  }

  /** Envia um job ao agente do restaurante, se estiver online. */
  async dispatch(jobId: string): Promise<boolean> {
    const job = await this.prisma.printJob.findUnique({ where: { id: jobId }, include: { order: true } });
    if (!job) return false;
    return this.send(job.restaurantId, job.id, job.order.data);
  }

  /** Desconecta um agente (ex.: após revogar o acesso). */
  disconnect(agentId: string, reason: string): void {
    for (const s of this.byRestaurant.values()) {
      if (s.agentId === agentId) s.ws.close(CloseCodes.UNAUTHORIZED, reason);
    }
  }

  closeAll(): void {
    for (const s of this.byRestaurant.values()) s.ws.close(1001, 'server shutting down');
  }

  private async authenticate(ws: WebSocket, hello: AgentHello): Promise<Session | null> {
    const agent = await this.prisma.agent.findUnique({ where: { tokenHash: hashToken(hello.token) } });
    if (!agent || agent.revokedAt) {
      this.log.warn('Agente recusado: token inválido ou revogado');
      ws.close(CloseCodes.UNAUTHORIZED, 'unauthorized');
      return null;
    }

    const previous = this.byRestaurant.get(agent.restaurantId);
    if (previous && previous.ws !== ws) previous.ws.close(CloseCodes.REPLACED, 'replaced by new connection');

    const session: Session = { agentId: agent.id, restaurantId: agent.restaurantId, ws };
    this.byRestaurant.set(agent.restaurantId, session);

    await this.prisma.agent.update({
      where: { id: agent.id },
      data: { lastSeenAt: new Date(), version: hello.agentVersion, printers: hello.printers },
    });
    this.sendMessage(ws, { type: 'welcome', agentId: agent.id });
    this.log.info({ agentId: agent.id, name: agent.name, printers: hello.printers }, '🟢 Agente conectado');
    this.panel.publish(agent.restaurantId, { type: 'agents_changed' });

    await this.flushPending(agent.restaurantId);
    return session;
  }

  /** Reenvia jobs ainda não confirmados. O agente ignora duplicados pelo jobId. */
  private async flushPending(restaurantId: string): Promise<void> {
    const pending = await this.prisma.printJob.findMany({
      where: { restaurantId, status: { in: ['QUEUED', 'SENT'] } },
      include: { order: true },
      orderBy: { createdAt: 'asc' },
    });
    if (pending.length) this.log.info({ count: pending.length }, 'Reenviando jobs sem confirmação');
    for (const job of pending) await this.send(restaurantId, job.id, job.order.data);
  }

  private async send(restaurantId: string, jobId: string, orderData: Prisma.JsonValue): Promise<boolean> {
    const session = this.byRestaurant.get(restaurantId);
    if (!session || session.ws.readyState !== session.ws.OPEN) return false;

    // Marca ANTES de enviar: o agente pode imprimir e confirmar em milissegundos,
    // e o ACK não pode ser sobrescrito por um "SENT" atrasado. O filtro de status
    // também impede que um job já finalizado volte para SENT.
    const { count } = await this.prisma.printJob.updateMany({
      where: { id: jobId, status: { in: ['QUEUED', 'SENT'] } },
      data: { status: 'SENT', sentAt: new Date(), sendCount: { increment: 1 } },
    });
    if (count === 0) return false;

    this.sendMessage(session.ws, { type: 'print_job', jobId, order: orderData as unknown as Order });
    return true;
  }

  private async applyAck(session: Session, ack: AgentAck): Promise<void> {
    const { count } = await this.prisma.printJob.updateMany({
      where: { id: ack.jobId, restaurantId: session.restaurantId },
      data: {
        status: ack.status === 'printed' ? 'PRINTED' : 'FAILED',
        printers: ack.printers,
        completedAt: new Date(),
      },
    });
    if (count === 0) {
      this.log.warn({ jobId: ack.jobId }, 'ACK para job desconhecido ignorado');
      return;
    }
    const job = await this.prisma.printJob.findUnique({ where: { id: ack.jobId }, select: { orderId: true } });
    if (job) {
      this.panel.publish(session.restaurantId, {
        type: 'order_updated',
        orderId: job.orderId,
        printStatus: ack.status === 'printed' ? 'PRINTED' : 'FAILED',
      });
    }
    this.log.info({ jobId: ack.jobId, status: ack.status, printers: ack.printers }, 'Job confirmado pelo agente');
  }

  private sendMessage(ws: WebSocket, msg: ServerMessage): void {
    ws.send(JSON.stringify(msg));
  }
}
