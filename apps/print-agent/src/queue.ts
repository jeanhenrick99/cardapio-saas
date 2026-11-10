import { DatabaseSync } from 'node:sqlite';
import type { Order, PrintResult } from '@cardapio/shared';

export type PrintStatus = 'pending' | 'printed' | 'failed';

export interface DuePrint {
  jobId: string;
  printer: string;
  attempts: number;
  order: Order;
}

export interface JobResult {
  jobId: string;
  status: PrintStatus;
  printers: PrintResult[];
}

/**
 * Fila persistente em SQLite (módulo nativo `node:sqlite`).
 *
 * - Todo job é gravado ANTES de imprimir: se o PC desligar, nada se perde.
 * - `job_id` é chave primária: receber o mesmo job duas vezes não imprime de novo.
 * - Cada job vira uma linha por impressora em `prints`, com retentativas
 *   e backoff exponencial.
 * - `ack_sent` funciona como uma "outbox": confirmações que não puderam ser
 *   enviadas (servidor offline) são reenviadas quando a conexão voltar.
 */
export class JobQueue {
  private readonly db: DatabaseSync;

  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS jobs (
        job_id      TEXT PRIMARY KEY,
        order_json  TEXT NOT NULL,
        received_at TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'pending',
        ack_sent    INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS prints (
        job_id          TEXT NOT NULL REFERENCES jobs(job_id),
        printer         TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending',
        attempts        INTEGER NOT NULL DEFAULT 0,
        last_error      TEXT,
        next_attempt_at INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (job_id, printer)
      );
    `);
  }

  /** Grava o job. Retorna `false` se esse jobId já tinha sido recebido (idempotência). */
  enqueue(jobId: string, order: Order, printers: string[]): boolean {
    this.db.exec('BEGIN');
    try {
      const result = this.db
        .prepare('INSERT OR IGNORE INTO jobs (job_id, order_json, received_at, status) VALUES (?, ?, ?, ?)')
        .run(jobId, JSON.stringify(order), new Date().toISOString(), printers.length > 0 ? 'pending' : 'printed');
      if (result.changes === 0) {
        this.db.exec('ROLLBACK');
        return false;
      }
      const insert = this.db.prepare('INSERT INTO prints (job_id, printer) VALUES (?, ?)');
      for (const printer of printers) insert.run(jobId, printer);
      this.db.exec('COMMIT');
      return true;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // transação já encerrada
      }
      throw err;
    }
  }

  /** Próxima impressão pendente cujo horário de tentativa já chegou (mais antiga primeiro). */
  nextDue(now: number): DuePrint | undefined {
    const row = this.db
      .prepare(
        `SELECT p.job_id AS jobId, p.printer AS printer, p.attempts AS attempts, j.order_json AS orderJson
           FROM prints p JOIN jobs j ON j.job_id = p.job_id
          WHERE p.status = 'pending' AND p.next_attempt_at <= ?
          ORDER BY j.rowid, p.printer
          LIMIT 1`,
      )
      .get(now) as { jobId: string; printer: string; attempts: number; orderJson: string } | undefined;
    if (!row) return undefined;
    return { jobId: row.jobId, printer: row.printer, attempts: row.attempts, order: JSON.parse(row.orderJson) as Order };
  }

  /** Horário (ms) da próxima retentativa agendada, se houver. */
  nextRetryAt(): number | undefined {
    const row = this.db.prepare(`SELECT MIN(next_attempt_at) AS t FROM prints WHERE status = 'pending'`).get() as
      | { t: number | null }
      | undefined;
    return row?.t ?? undefined;
  }

  markPrinted(jobId: string, printer: string): void {
    this.db
      .prepare(`UPDATE prints SET status = 'printed', attempts = attempts + 1, last_error = NULL WHERE job_id = ? AND printer = ?`)
      .run(jobId, printer);
  }

  /** Registra uma tentativa com falha. Após `maxAttempts`, a impressão fica como `failed`. */
  markAttemptFailed(
    jobId: string,
    printer: string,
    error: string,
    opts: { maxAttempts: number; retryBaseMs: number; now: number },
  ): PrintStatus {
    const row = this.db.prepare('SELECT attempts FROM prints WHERE job_id = ? AND printer = ?').get(jobId, printer) as
      | { attempts: number }
      | undefined;
    const attempts = (row?.attempts ?? 0) + 1;
    if (attempts >= opts.maxAttempts) {
      this.db
        .prepare(`UPDATE prints SET status = 'failed', attempts = ?, last_error = ? WHERE job_id = ? AND printer = ?`)
        .run(attempts, error, jobId, printer);
      return 'failed';
    }
    const nextAt = opts.now + opts.retryBaseMs * 2 ** (attempts - 1);
    this.db
      .prepare('UPDATE prints SET attempts = ?, last_error = ?, next_attempt_at = ? WHERE job_id = ? AND printer = ?')
      .run(attempts, error, nextAt, jobId, printer);
    return 'pending';
  }

  /** Recalcula o status do job a partir das impressões. */
  refreshJobStatus(jobId: string): PrintStatus {
    const rows = this.db.prepare('SELECT status FROM prints WHERE job_id = ?').all(jobId) as { status: PrintStatus }[];
    const status: PrintStatus = rows.some((r) => r.status === 'pending')
      ? 'pending'
      : rows.some((r) => r.status === 'failed')
        ? 'failed'
        : 'printed';
    this.db.prepare('UPDATE jobs SET status = ? WHERE job_id = ?').run(status, jobId);
    return status;
  }

  getResult(jobId: string): JobResult | undefined {
    const job = this.db.prepare('SELECT status FROM jobs WHERE job_id = ?').get(jobId) as
      | { status: PrintStatus }
      | undefined;
    if (!job) return undefined;
    const prints = this.db
      .prepare('SELECT printer, status, last_error AS error FROM prints WHERE job_id = ? ORDER BY printer')
      .all(jobId) as { printer: string; status: PrintStatus; error: string | null }[];
    return {
      jobId,
      status: job.status,
      printers: prints
        .filter((p) => p.status !== 'pending')
        .map((p) => ({
          name: p.printer,
          status: p.status as PrintResult['status'],
          ...(p.status === 'failed' && p.error ? { error: p.error } : {}),
        })),
    };
  }

  /** Jobs finalizados cuja confirmação ainda não foi enviada ao servidor. */
  pendingAcks(): JobResult[] {
    const rows = this.db
      .prepare(`SELECT job_id AS jobId FROM jobs WHERE status != 'pending' AND ack_sent = 0 ORDER BY rowid`)
      .all() as { jobId: string }[];
    return rows.map((r) => this.getResult(r.jobId)).filter((r): r is JobResult => r !== undefined);
  }

  markAckSent(jobId: string): void {
    this.db.prepare('UPDATE jobs SET ack_sent = 1 WHERE job_id = ?').run(jobId);
  }

  /** O servidor reenviou um job já conhecido: provavelmente não recebeu o ACK. */
  requeueAck(jobId: string): void {
    this.db.prepare('UPDATE jobs SET ack_sent = 0 WHERE job_id = ?').run(jobId);
  }

  close(): void {
    this.db.close();
  }
}
