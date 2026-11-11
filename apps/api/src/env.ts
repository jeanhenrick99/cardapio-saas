import { z } from 'zod';

// Carrega o .env com o recurso nativo do Node (sem dotenv).
// Variáveis já definidas no ambiente têm prioridade sobre o arquivo.
try {
  process.loadEnvFile();
} catch {
  // sem .env: usa apenas as variáveis do ambiente
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().default(8080),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /**
   * "true" quando a API fica atrás de um proxy (Vercel, Render...): usa o IP real
   * do cliente (X-Forwarded-For) no limite de tentativas, em vez do IP do proxy.
   */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Variáveis de ambiente inválidas (veja apps/api/.env.example):\n${issues}`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
