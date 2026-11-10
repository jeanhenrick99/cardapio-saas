import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PrintAgent } from './agent';
import { loadConfig } from './config';
import { ServerConnection } from './connection';
import { loadCredentials } from './credentials';
import { log } from './log';
import { createDrivers } from './printers';
import { JobQueue } from './queue';
import { AGENT_VERSION } from './version';

const config = loadConfig();
const dataDir = resolve(config.dataDir);
mkdirSync(dataDir, { recursive: true });

const credentials = loadCredentials(dataDir);
const token = config.token ?? credentials?.token;
if (!token) {
  log.error('Este agente ainda não foi pareado com um restaurante.');
  log.error('Gere um código no painel e rode: npm run pair -- SEU-CODIGO');
  process.exit(1);
}
if (credentials && !config.token) log.info(`Restaurante: ${credentials.restaurant.name}`);

const queue = new JobQueue(join(dataDir, 'queue.db'));
const agent = new PrintAgent({ config, queue, drivers: createDrivers(config.printers) });

const connection = new ServerConnection({
  url: config.serverUrl,
  token,
  agentVersion: AGENT_VERSION,
  printers: config.printers.map((p) => p.name),
  onReady: () => agent.flushAcks(),
  onMessage: (msg) => {
    if (msg.type === 'print_job') agent.handleJob(msg.jobId, msg.order);
  },
  onUnauthorized: (reason) => {
    log.error(reason === 'revoked' ? 'O acesso deste agente foi revogado no painel.' : 'O servidor recusou o token deste agente.');
    log.error('Gere um novo código no painel e rode: npm run pair -- SEU-CODIGO --force');
    shutdown(1);
  },
});
agent.setSender((msg) => connection.send(msg));

log.info(`Agente de impressão v${AGENT_VERSION}, impressoras: ${config.printers.map((p) => `${p.name} (${p.type})`).join(', ')}`);

// Retoma impressões que ficaram pendentes antes de o agente ser fechado.
void agent.process();
connection.start();

function shutdown(code = 0) {
  log.info('Encerrando agente...');
  connection.stop();
  agent.stop();
  queue.close();
  process.exit(code);
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
