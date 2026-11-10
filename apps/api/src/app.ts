import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { ZodError } from 'zod';
import { AgentHub } from './agents/hub';
import { prisma } from './db';
import { agentRoutes } from './routes/agents';
import { restaurantRoutes } from './routes/restaurants';

export async function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify(opts);
  const hub = new AgentHub(prisma, app.log);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Dados inválidos',
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode < 500) return reply.send(error);
    request.log.error({ err: error }, 'Erro inesperado');
    return reply.code(500).send({ error: 'Erro interno' });
  });

  await app.register(rateLimit, { global: false });
  await app.register(websocket);

  app.get('/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  });

  await app.register(restaurantRoutes, { hub });
  await app.register(agentRoutes, { hub });

  app.addHook('onClose', async () => {
    hub.closeAll();
    await prisma.$disconnect();
  });

  return app;
}
