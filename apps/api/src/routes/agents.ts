import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AgentHub } from '../agents/hub';
import { generateAgentToken, hashToken, normalizePairingCode } from '../auth/tokens';
import { prisma } from '../db';

const PairBody = z.object({
  code: z.string(),
  name: z.string().min(1).max(100).default('Agente de impressão'),
});

export async function agentRoutes(app: FastifyInstance, { hub }: { hub: AgentHub }) {
  /**
   * Troca um código de pareamento por um token permanente do agente.
   * Rota pública, por isso o limite de tentativas contra força bruta.
   */
  app.post(
    '/agents/pair',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = PairBody.parse(request.body);
      const code = normalizePairingCode(body.code);
      const invalid = () => reply.code(400).send({ error: 'Código inválido ou expirado' });
      if (!code) return invalid();

      const token = generateAgentToken();
      const result = await prisma.$transaction(async (tx) => {
        // "Consome" o código de forma atômica: dois agentes não conseguem usar o mesmo código.
        const pairing = await tx.pairingCode.findUnique({ where: { codeHash: hashToken(code) }, include: { restaurant: true } });
        if (!pairing || pairing.usedAt || pairing.expiresAt < new Date()) return null;
        const { count } = await tx.pairingCode.updateMany({ where: { id: pairing.id, usedAt: null }, data: { usedAt: new Date() } });
        if (count === 0) return null;

        const agent = await tx.agent.create({
          data: { restaurantId: pairing.restaurantId, name: body.name, tokenHash: hashToken(token) },
        });
        return { agent, restaurant: pairing.restaurant };
      });

      if (!result) return invalid();
      request.log.info({ agentId: result.agent.id, restaurant: result.restaurant.slug }, 'Agente pareado');
      return reply.code(201).send({
        agentId: result.agent.id,
        token,
        restaurant: { id: result.restaurant.id, name: result.restaurant.name, slug: result.restaurant.slug },
      });
    },
  );

  app.get('/agent', { websocket: true }, (socket) => hub.handleConnection(socket));

  /** Conexão ao vivo do painel do restaurante (autenticada pelo passe de /live-token). */
  app.get('/panel/live', { websocket: true }, (socket, request) => {
    const { token } = request.query as { token?: string };
    hub.panel.handleConnection(socket, token);
  });
}
