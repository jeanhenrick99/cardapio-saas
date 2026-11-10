import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { loadCredentials, pairUrlFrom, saveCredentials } from './credentials';

describe('pairUrlFrom', () => {
  it('converte a URL do WebSocket na rota HTTP de pareamento', () => {
    assert.equal(pairUrlFrom('ws://localhost:8080/agent'), 'http://localhost:8080/agents/pair');
    assert.equal(pairUrlFrom('wss://api.exemplo.com/agent?x=1'), 'https://api.exemplo.com/agents/pair');
  });
});

describe('credenciais', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-test-'));
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('retorna null quando o agente não foi pareado', () => {
    assert.equal(loadCredentials(dir), null);
  });

  it('salva com permissão restrita e lê de volta', () => {
    const creds = {
      agentId: 'a1',
      token: 'agt_secreto',
      serverUrl: 'ws://localhost:8080/agent',
      restaurant: { id: 'r1', name: 'Demo', slug: 'demo' },
      pairedAt: new Date().toISOString(),
    };
    const file = saveCredentials(dir, creds);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.deepEqual(loadCredentials(dir), creds);
  });
});
