import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const CredentialsSchema = z.object({
  agentId: z.string(),
  token: z.string(),
  serverUrl: z.string(),
  restaurant: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  pairedAt: z.string(),
});

export type Credentials = z.infer<typeof CredentialsSchema>;

const fileFor = (dataDir: string) => join(dataDir, 'credentials.json');

export function loadCredentials(dataDir: string): Credentials | null {
  const file = fileFor(dataDir);
  if (!existsSync(file)) return null;
  const result = CredentialsSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  return result.success ? result.data : null;
}

export function saveCredentials(dataDir: string, credentials: Credentials): string {
  const file = fileFor(dataDir);
  writeFileSync(file, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600); // só o usuário dono pode ler o token
  return file;
}

/** ws://host:8080/agent → http://host:8080/agents/pair */
export function pairUrlFrom(serverUrl: string): string {
  const url = new URL(serverUrl);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = '/agents/pair';
  url.search = '';
  return url.toString();
}
