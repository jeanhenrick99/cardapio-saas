import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PrintAgent } from './agent';
import { loadConfig } from './config';
import { ServerConnection } from './connection';
import { log } from './log';
import { createDrivers } from './printers';
import { JobQueue } from './queue';
import { AGENT_VERSION } from './version';

const config = loadConfig();
const dataDir = resolve(config.dataDir);
mkdirSync(dataDir, { recursive: true });

const queue = new JobQueue(join(dataDir, 'queue.db'));
const agent = new PrintAgent({ config, queue, drivers: createDrivers(config.printers) });

const connection = new ServerConnection({
  url: config.serverUrl,
  token: config.token,
  agentVersion: AGENT_VERSION,
  printers: config.printers.map((p) => p.name),
  onReady: () => agent.flushAcks(),
  onMessage: (msg) => {
    if (msg.type === 'print_job') agent.handleJob(msg.jobId, msg.order);
  },
});
agent.setSender((msg) => connection.send(msg));

log.info(`Agente de impressão v${AGENT_VERSION}, impressoras: ${config.printers.map((p) => `${p.name} (${p.type})`).join(', ')}`);

// Retoma impressões que ficaram pendentes antes de o agente ser fechado.
void agent.process();
connection.start();

const shutdown = () => {
  log.info('Encerrando agente...');
  connection.stop();
  agent.stop();
  queue.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
