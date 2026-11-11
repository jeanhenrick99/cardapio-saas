import { buildApp } from './app';
import { env } from './env';

const app = await buildApp({
  trustProxy: env.TRUST_PROXY,
  logger: {
    level: env.LOG_LEVEL,
    // Logs legíveis no terminal durante o desenvolvimento; JSON puro em produção.
    transport: process.stdout.isTTY
      ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname,reqId,req,res,responseTime' } }
      : undefined,
  },
});

await app.listen({ port: env.PORT, host: env.HOST });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info('Encerrando servidor...');
    void app.close().then(() => process.exit(0));
  });
}
