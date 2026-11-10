import type { AgentMessage, Order } from '@cardapio/shared';
import type { AgentConfig } from './config';
import { encodeEscPos } from './escpos/encoder';
import { log } from './log';
import type { PrinterDriver } from './printers';
import type { DuePrint, JobQueue } from './queue';
import { buildTicket, itemsForPrinter } from './render/receipt';

export type Sender = (msg: AgentMessage) => boolean;

export interface PrintAgentDeps {
  config: AgentConfig;
  queue: JobQueue;
  drivers: Map<string, PrinterDriver>;
  now?: () => number;
}

/**
 * Orquestra o fluxo:  job recebido → fila → roteamento por setor → impressão → ACK.
 * Não sabe nada de WebSocket: recebe uma função `send` para enviar as confirmações.
 */
export class PrintAgent {
  private sender: Sender | null = null;
  private running: Promise<void> | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: PrintAgentDeps) {
    this.now = deps.now ?? Date.now;
  }

  setSender(sender: Sender | null): void {
    this.sender = sender;
  }

  handleJob(jobId: string, order: Order): void {
    const { config, queue } = this.deps;
    const targets = config.printers.filter((p) => itemsForPrinter(order, p).length > 0).map((p) => p.name);

    if (!queue.enqueue(jobId, order, targets)) {
      log.info(`Job ${jobId} já foi recebido antes: impressão duplicada ignorada, reenviando confirmação`);
      queue.requeueAck(jobId);
      this.flushAcks();
      return;
    }

    log.info(`Pedido #${order.number} (job ${jobId}) → ${targets.join(', ') || 'nenhuma impressora'}`);
    if (targets.length === 0) this.flushAcks();
    else void this.process();
  }

  /**
   * Processa todas as impressões pendentes, uma por vez.
   * Se já houver um processamento rodando, devolve a mesma promise
   * (o laço consulta a fila a cada volta, então pega os jobs novos).
   */
  process(): Promise<void> {
    this.running ??= this.drain().finally(() => {
      this.running = null;
      this.scheduleRetry();
    });
    return this.running;
  }

  private async drain(): Promise<void> {
    let due: DuePrint | undefined;
    while ((due = this.deps.queue.nextDue(this.now()))) {
      await this.printOne(due);
    }
  }

  /** Envia as confirmações pendentes (chamado também ao reconectar). */
  flushAcks(): void {
    if (!this.sender) return;
    for (const result of this.deps.queue.pendingAcks()) {
      const sent = this.sender({
        type: 'ack',
        jobId: result.jobId,
        status: result.status === 'failed' ? 'failed' : 'printed',
        printers: result.printers,
      });
      if (!sent) break; // offline: tenta de novo na próxima conexão
      this.deps.queue.markAckSent(result.jobId);
    }
  }

  stop(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private async printOne(due: DuePrint): Promise<void> {
    const { config, queue, drivers } = this.deps;
    const printer = config.printers.find((p) => p.name === due.printer);
    const driver = drivers.get(due.printer);

    try {
      if (!printer || !driver) throw new Error('PRINTER_NOT_CONFIGURED');
      const receipt = buildTicket(due.order, itemsForPrinter(due.order, printer), {
        title: printer.title ?? printer.name,
        columns: printer.columns,
        showPrices: printer.showPrices,
      });
      await driver.print({ jobId: due.jobId, receipt, bytes: encodeEscPos(receipt) });
      queue.markPrinted(due.jobId, due.printer);
      log.info(`✔ Pedido #${due.order.number} impresso em "${due.printer}"`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = queue.markAttemptFailed(due.jobId, due.printer, message, {
        maxAttempts: printer && driver ? config.maxAttempts : 1,
        retryBaseMs: config.retryBaseMs,
        now: this.now(),
      });
      const attempt = due.attempts + 1;
      if (status === 'failed') log.error(`Pedido #${due.order.number} falhou em "${due.printer}" após ${attempt} tentativa(s): ${message}`);
      else log.warn(`Falha em "${due.printer}" (tentativa ${attempt}/${config.maxAttempts}): ${message}. Nova tentativa agendada.`);
    }

    if (queue.refreshJobStatus(due.jobId) !== 'pending') this.flushAcks();
  }

  private scheduleRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const at = this.deps.queue.nextRetryAt();
    if (at === undefined) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.process();
    }, Math.max(0, at - this.now()));
    this.retryTimer.unref();
  }
}
