/**
 * Servidor de desenvolvimento: simula a parte "nuvem" do sistema.
 *
 *   POST /orders     cria um pedido (corpo JSON opcional; sem corpo = pedido aleatório)
 *   GET  /jobs       lista os jobs de impressão e seus status
 *   GET  /health     status do servidor e do agente
 *   WS   /agent      conexão do agente de impressão
 *
 * Também dá para pressionar ENTER no terminal para gerar um pedido aleatório.
 */
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  CloseCodes,
  OrderSchema,
  parseAgentMessage,
  type Order,
  type PrintResult,
  type ServerMessage,
} from '@cardapio/shared';
import { sampleOrder } from './sample-orders';

const PORT = Number(process.env.PORT ?? 8080);
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? 'dev-token';

type JobStatus = 'queued' | 'sent' | 'printed' | 'failed';
interface Job {
  jobId: string;
  order: Order;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  printers?: PrintResult[];
}

/** Em produção isso seria uma tabela `print_jobs` no Postgres (outbox). */
const jobs = new Map<string, Job>();
let agent: { ws: WebSocket; id: string; lastSeen: Date; printers: string[] } | null = null;
let lastOrderNumber = 0;

const time = () => new Date().toLocaleTimeString('pt-BR', { hour12: false });
const log = (msg: string) => console.log(`[${time()}] ${msg}`);

function send(ws: WebSocket, msg: ServerMessage) {
  ws.send(JSON.stringify(msg));
}

function dispatch(job: Job) {
  if (!agent || agent.ws.readyState !== WebSocket.OPEN) {
    log(`Pedido #${job.order.number} na fila: agente offline`);
    return;
  }
  send(agent.ws, { type: 'print_job', jobId: job.jobId, order: job.order });
  job.status = 'sent';
  job.updatedAt = new Date().toISOString();
  log(`→ Pedido #${job.order.number} enviado ao agente (job ${job.jobId})`);
}

function createOrder(input: unknown): Job {
  const base = typeof input === 'object' && input !== null ? input : {};
  const order = OrderSchema.parse({
    id: randomUUID(),
    number: lastOrderNumber + 1,
    createdAt: new Date().toISOString(),
    ...base,
  });
  lastOrderNumber = Math.max(lastOrderNumber, order.number);
  const now = new Date().toISOString();
  const job: Job = { jobId: randomUUID(), order, status: 'queued', createdAt: now, updatedAt: now };
  jobs.set(job.jobId, job);
  dispatch(job);
  return job;
}

// ---------- HTTP ----------

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  try {
    if (req.method === 'POST' && url.pathname === '/orders') {
      const raw = await readBody(req);
      const input = raw.trim() ? JSON.parse(raw) : sampleOrder(lastOrderNumber + 1);
      const result = OrderSchema.safeParse({ id: randomUUID(), number: lastOrderNumber + 1, createdAt: new Date().toISOString(), ...input });
      if (!result.success) return json(res, 400, { error: 'Pedido inválido', issues: result.error.issues });
      const job = createOrder(result.data);
      return json(res, 201, job);
    }
    if (req.method === 'GET' && url.pathname === '/jobs') {
      return json(res, 200, [...jobs.values()].reverse());
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, {
        ok: true,
        agent: agent ? { id: agent.id, online: agent.ws.readyState === WebSocket.OPEN, lastSeen: agent.lastSeen, printers: agent.printers } : null,
      });
    }
    json(res, 404, { error: 'Not found' });
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : String(err) });
  }
});

// ---------- WebSocket do agente ----------

const wss = new WebSocketServer({ server, path: '/agent' });

wss.on('connection', (ws) => {
  let authed = false;
  const helloTimeout = setTimeout(() => ws.close(CloseCodes.UNAUTHORIZED, 'hello timeout'), 5_000);

  ws.on('message', (data) => {
    const msg = parseAgentMessage(data.toString());
    if (!msg) return log('Mensagem inválida do agente ignorada');

    if (!authed) {
      if (msg.type !== 'hello' || msg.token !== AGENT_TOKEN) {
        log('✖ Agente recusado: token inválido');
        return ws.close(CloseCodes.UNAUTHORIZED, 'unauthorized');
      }
      clearTimeout(helloTimeout);
      authed = true;
      if (agent && agent.ws !== ws) agent.ws.close(CloseCodes.REPLACED, 'replaced by new connection');
      agent = { ws, id: randomUUID().slice(0, 8), lastSeen: new Date(), printers: msg.printers };
      send(ws, { type: 'welcome', agentId: agent.id });
      log(`🟢 Agente ${agent.id} conectado (v${msg.agentVersion}, impressoras: ${msg.printers.join(', ')})`);

      // Reenvia tudo que não foi confirmado: o agente ignora duplicados pelo jobId.
      const pending = [...jobs.values()].filter((j) => j.status === 'queued' || j.status === 'sent');
      if (pending.length) log(`Reenviando ${pending.length} job(s) sem confirmação`);
      pending.forEach(dispatch);
      return;
    }

    if (agent?.ws === ws) agent.lastSeen = new Date();

    if (msg.type === 'ack') {
      const job = jobs.get(msg.jobId);
      if (!job) return;
      job.status = msg.status;
      job.printers = msg.printers;
      job.updatedAt = new Date().toISOString();
      const detail = msg.printers.map((p) => `${p.name} ${p.status === 'printed' ? '✓' : `✖ ${p.error ?? ''}`}`).join(', ');
      log(`${msg.status === 'printed' ? '✔' : '✖'} Pedido #${job.order.number}: ${msg.status} [${detail || 'nada a imprimir'}]`);
    }
  });

  ws.on('close', () => {
    clearTimeout(helloTimeout);
    if (agent?.ws === ws) {
      log(`🔴 Agente ${agent.id} desconectado`);
      agent = null;
    }
  });
});

server.listen(PORT, () => {
  log(`Servidor de desenvolvimento em http://localhost:${PORT}`);
  log(`Agente deve conectar em ws://localhost:${PORT}/agent (token: ${AGENT_TOKEN})`);
  log('Pressione ENTER para criar um pedido aleatório, ou: curl -X POST localhost:' + PORT + '/orders');
});

process.stdin.on('data', () => {
  createOrder(sampleOrder(lastOrderNumber + 1));
});
