import { z } from 'zod';
import { OrderSchema } from './order';

/**
 * Protocolo WebSocket entre o servidor (nuvem) e o agente de impressão (PC do restaurante).
 *
 *   agente  → servidor: hello, heartbeat, ack
 *   servidor → agente : welcome, print_job, error
 *
 * Toda mensagem é JSON com um campo `type` (união discriminada).
 */
export const PROTOCOL_VERSION = 1;

// ---------- agente → servidor ----------

export const AgentHelloSchema = z.object({
  type: z.literal('hello'),
  token: z.string().min(1),
  agentVersion: z.string(),
  protocolVersion: z.number().int(),
  printers: z.array(z.string()),
});

export const AgentHeartbeatSchema = z.object({
  type: z.literal('heartbeat'),
  at: z.string(),
});

export const PrintResultSchema = z.object({
  name: z.string(),
  status: z.enum(['printed', 'failed']),
  error: z.string().optional(),
});

/** Confirmação final de um job: só é enviada quando todas as impressoras terminaram. */
export const AgentAckSchema = z.object({
  type: z.literal('ack'),
  jobId: z.string(),
  status: z.enum(['printed', 'failed']),
  printers: z.array(PrintResultSchema),
});

export const AgentMessageSchema = z.discriminatedUnion('type', [
  AgentHelloSchema,
  AgentHeartbeatSchema,
  AgentAckSchema,
]);

// ---------- servidor → agente ----------

export const ServerWelcomeSchema = z.object({
  type: z.literal('welcome'),
  agentId: z.string(),
});

export const ServerPrintJobSchema = z.object({
  type: z.literal('print_job'),
  /** Identificador único e estável: reenviar o mesmo jobId nunca imprime duas vezes. */
  jobId: z.string(),
  order: OrderSchema,
});

export const ServerErrorSchema = z.object({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
});

export const ServerMessageSchema = z.discriminatedUnion('type', [
  ServerWelcomeSchema,
  ServerPrintJobSchema,
  ServerErrorSchema,
]);

export type AgentHello = z.infer<typeof AgentHelloSchema>;
export type AgentAck = z.infer<typeof AgentAckSchema>;
export type PrintResult = z.infer<typeof PrintResultSchema>;
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
export type ServerPrintJob = z.infer<typeof ServerPrintJobSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

/** Códigos de fechamento WebSocket usados pelo servidor. */
export const CloseCodes = {
  UNAUTHORIZED: 4001,
  REPLACED: 4002,
} as const;

function parseWith<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, raw: string): T | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = schema.safeParse(json);
  return result.success ? result.data : null;
}

export const parseAgentMessage = (raw: string) => parseWith(AgentMessageSchema, raw);
export const parseServerMessage = (raw: string) => parseWith(ServerMessageSchema, raw);
