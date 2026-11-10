import { z } from 'zod';

// Carrega o .env com o recurso nativo do Node (sem dotenv).
try {
  process.loadEnvFile();
} catch {
  // sem .env: usa apenas as variáveis do ambiente
}

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().default(8080),
  HOST: z.string().default('0.0.0.0'),
  ADMIN_TOKEN: z.string().min(8, 'ADMIN_TOKEN precisa de pelo menos 8 caracteres'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Variáveis de ambiente inválidas (veja apps/api/.env.example):\n${issues}`);
}

export const env = parsed.data;
export type Env = typeof env;
