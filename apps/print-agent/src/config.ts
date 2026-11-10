import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { log } from './log';

const PrinterBaseSchema = z.object({
  name: z.string().min(1),
  /** Título impresso no topo do cupom. Padrão: nome em maiúsculas. */
  title: z.string().optional(),
  /** 48 colunas = papel 80 mm, 32 colunas = papel 58 mm. */
  columns: z.union([z.literal(32), z.literal(48)]).default(48),
  /** Setores que esta impressora recebe. "*" = todos (ex.: via do caixa). */
  sectors: z.array(z.string()).min(1),
  showPrices: z.boolean().default(false),
});

const VirtualPrinterSchema = PrinterBaseSchema.extend({
  type: z.literal('virtual'),
  outputDir: z.string().default('./output'),
  /** 0 a 1: chance de falha simulada, útil para testar as retentativas. */
  failureRate: z.number().min(0).max(1).default(0),
});

const NetworkPrinterSchema = PrinterBaseSchema.extend({
  type: z.literal('network'),
  host: z.string(),
  port: z.number().int().default(9100),
  timeoutMs: z.number().int().positive().default(5000),
});

export const PrinterConfigSchema = z.discriminatedUnion('type', [
  VirtualPrinterSchema,
  NetworkPrinterSchema,
]);

export const AgentConfigSchema = z
  .object({
    serverUrl: z.string().url(),
    /** Opcional: normalmente o token vem do pareamento (data/credentials.json). */
    token: z.string().min(1).optional(),
    dataDir: z.string().default('./data'),
    maxAttempts: z.number().int().positive().default(3),
    retryBaseMs: z.number().int().nonnegative().default(2000),
    printers: z.array(PrinterConfigSchema).min(1),
  })
  .refine((c) => new Set(c.printers.map((p) => p.name)).size === c.printers.length, {
    message: 'Nomes de impressoras devem ser únicos',
  });

export type PrinterConfig = z.infer<typeof PrinterConfigSchema>;
export type VirtualPrinterConfig = z.infer<typeof VirtualPrinterSchema>;
export type NetworkPrinterConfig = z.infer<typeof NetworkPrinterSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export function loadConfig(): AgentConfig {
  let path = resolve(process.env.AGENT_CONFIG ?? 'agent.config.json');
  if (!existsSync(path) && !process.env.AGENT_CONFIG) {
    path = resolve('agent.config.example.json');
    log.warn('agent.config.json não encontrado, usando agent.config.example.json');
  }
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const result = AgentConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.') || '(raiz)'}: ${i.message}`);
    throw new Error(`Configuração inválida em ${path}:\n${issues.join('\n')}`);
  }
  return result.data;
}
