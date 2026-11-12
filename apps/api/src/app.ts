import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { ZodError } from 'zod';
import { AgentHub } from './agents/hub';
import { PanelHub } from './live/panel-hub';
import { prisma } from './db';
import { CheckoutError } from './menu/pricing';
import { env } from './env';
import { adminRoutes } from './routes/admin';
import { agentRoutes } from './routes/agents';
import { authRoutes } from './routes/auth';
import { menuRoutes } from './routes/menu';
import { publicRoutes } from './routes/public';
import { restaurantRoutes } from './routes/restaurants';
import { cashRoutes } from './routes/cash';
import { reportRoutes } from './routes/reports';
import { teamRoutes } from './routes/team';
import { tabRoutes } from './routes/tabs';

export async function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify(opts);
  const hub = new AgentHub(prisma, app.log, new PanelHub(app.log));

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Dados inválidos',
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (error instanceof CheckoutError) {
      return reply.code(422).send({ error: error.message });
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode < 500) return reply.send(error);
    request.log.error({ err: error }, 'Erro inesperado');
    return reply.code(500).send({ error: 'Erro interno' });
  });

  app.decorateRequest('user', null);
  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    // Nos testes, o limite só vale para quem pedir explicitamente (pelo header).
    allowList: env.NODE_ENV === 'test' ? (req) => !req.headers['x-test-rate-limit'] : undefined,
  });
  await app.register(websocket);

  app.get('/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  });

  await app.register(authRoutes);
  await app.register(restaurantRoutes, { hub });
  await app.register(menuRoutes);
  await app.register(tabRoutes, { hub });
  await app.register(cashRoutes, { hub });
  await app.register(reportRoutes);
  await app.register(teamRoutes);
  await app.register(adminRoutes);
  await app.register(publicRoutes, { hub });
  await app.register(agentRoutes, { hub });

  app.addHook('onClose', async () => {
    hub.closeAll();
    hub.panel.closeAll();
    await prisma.$disconnect();
  });

  return app;
}
