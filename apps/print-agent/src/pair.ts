/**
 * Pareia este agente com um restaurante usando o código gerado no painel.
 *
 *   npm run pair -- K7P-2QX
 *   npm run pair -- K7P-2QX --name "PC do caixa"
 */
import { mkdirSync } from 'node:fs';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from './config';
import { loadCredentials, pairUrlFrom, saveCredentials } from './credentials';
import { log } from './log';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { name: { type: 'string' }, force: { type: 'boolean', default: false } },
});

const code = positionals[0];
if (!code) {
  log.error('Informe o código de pareamento. Ex.: npm run pair -- K7P-2QX');
  process.exit(1);
}

const config = loadConfig();
const dataDir = resolve(config.dataDir);
mkdirSync(dataDir, { recursive: true });

const existing = loadCredentials(dataDir);
if (existing && !values.force) {
  log.warn(`Este agente já está pareado com "${existing.restaurant.name}". Use --force para parear de novo.`);
  process.exit(1);
}

const name = values.name ?? `Agente ${hostname()}`;
const url = pairUrlFrom(config.serverUrl);

let res: Response;
try {
  res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, name }),
  });
} catch (err) {
  log.error(`Não foi possível falar com o servidor em ${url}: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const body = (await res.json()) as {
  agentId?: string;
  token?: string;
  restaurant?: { id: string; name: string; slug: string };
  error?: string;
};
if (!res.ok || !body.agentId || !body.token || !body.restaurant) {
  log.error(`Pareamento recusado: ${body.error ?? `HTTP ${res.status}`}`);
  process.exit(1);
}

const file = saveCredentials(dataDir, {
  agentId: body.agentId,
  token: body.token,
  serverUrl: config.serverUrl,
  restaurant: body.restaurant,
  pairedAt: new Date().toISOString(),
});
log.info(`✔ Pareado com "${body.restaurant.name}" como "${name}"`);
log.info(`Credenciais salvas em ${file}. Agora rode: npm run dev:agent`);
