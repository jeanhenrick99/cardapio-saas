import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { OrderSchema, type AgentMessage } from '@cardapio/shared';
import { PrintAgent } from './agent';
import { AgentConfigSchema } from './config';
import type { PrinterDriver, PrintRequest } from './printers';
import { JobQueue } from './queue';

class FakePrinter implements PrinterDriver {
  printed: PrintRequest[] = [];
  failuresLeft = 0;
  constructor(readonly name: string) {}
  async print(req: PrintRequest) {
    if (this.failuresLeft > 0) {
      this.failuresLeft--;
      throw new Error('PAPER_OUT');
    }
    this.printed.push(req);
  }
}

const config = AgentConfigSchema.parse({
  serverUrl: 'ws://localhost:1/agent',
  token: 't',
  maxAttempts: 3,
  retryBaseMs: 0,
  printers: [
    { name: 'cozinha', type: 'virtual', sectors: ['cozinha'] },
    { name: 'bar', type: 'virtual', sectors: ['bar'] },
  ],
});

const order = (items: { sector: string }[]) =>
  OrderSchema.parse({
    id: 'o',
    number: 7,
    createdAt: new Date().toISOString(),
    type: 'mesa',
    table: '3',
    items: items.map((i, n) => ({ id: String(n), name: `Item ${n}`, quantity: 1, unitPriceCents: 100, sector: i.sector })),
  });

describe('PrintAgent', () => {
  let queue: JobQueue;
  let cozinha: FakePrinter;
  let bar: FakePrinter;
  let sent: AgentMessage[];
  let online: boolean;
  let agent: PrintAgent;

  beforeEach(() => {
    queue = new JobQueue(':memory:');
    cozinha = new FakePrinter('cozinha');
    bar = new FakePrinter('bar');
    sent = [];
    online = true;
    agent = new PrintAgent({ config, queue, drivers: new Map([['cozinha', cozinha], ['bar', bar]]) });
    agent.setSender((msg) => (online ? (sent.push(msg), true) : false));
  });

  it('roteia por setor e envia um único ACK quando tudo foi impresso', async () => {
    agent.handleJob('j1', order([{ sector: 'cozinha' }, { sector: 'bar' }, { sector: 'cozinha' }]));
    await agent.process();
    assert.equal(cozinha.printed.length, 1);
    assert.equal(bar.printed.length, 1);
    assert.deepEqual(sent, [
      { type: 'ack', jobId: 'j1', status: 'printed', printers: [{ name: 'bar', status: 'printed' }, { name: 'cozinha', status: 'printed' }] },
    ]);
  });

  it('não imprime de novo um job repetido, mas reenvia a confirmação', async () => {
    agent.handleJob('j1', order([{ sector: 'cozinha' }]));
    await agent.process();
    agent.handleJob('j1', order([{ sector: 'cozinha' }]));
    await agent.process();
    assert.equal(cozinha.printed.length, 1);
    assert.equal(sent.length, 2);
    assert.deepEqual(sent[0], sent[1]);
  });

  it('tenta de novo e imprime quando a impressora volta', async () => {
    cozinha.failuresLeft = 2;
    agent.handleJob('j1', order([{ sector: 'cozinha' }]));
    await agent.process();
    assert.equal(cozinha.printed.length, 1);
    assert.equal(sent[0]?.type === 'ack' && sent[0].status, 'printed');
  });

  it('marca como falha após o limite de tentativas, sem travar as outras impressoras', async () => {
    cozinha.failuresLeft = 99;
    agent.handleJob('j1', order([{ sector: 'cozinha' }, { sector: 'bar' }]));
    await agent.process();
    assert.equal(bar.printed.length, 1);
    assert.deepEqual(sent, [
      {
        type: 'ack',
        jobId: 'j1',
        status: 'failed',
        printers: [{ name: 'bar', status: 'printed' }, { name: 'cozinha', status: 'failed', error: 'PAPER_OUT' }],
      },
    ]);
  });

  it('guarda o ACK enquanto offline e envia ao reconectar', async () => {
    online = false;
    agent.handleJob('j1', order([{ sector: 'bar' }]));
    await agent.process();
    assert.equal(bar.printed.length, 1);
    assert.equal(sent.length, 0);

    online = true;
    agent.flushAcks();
    assert.equal(sent.length, 1);
    agent.flushAcks();
    assert.equal(sent.length, 1, 'não duplica ACK já enviado');
  });

  it('pedido sem itens para nenhuma impressora é confirmado sem imprimir', async () => {
    agent.handleJob('j1', order([{ sector: 'sobremesa' }]));
    await agent.process();
    assert.deepEqual(sent, [{ type: 'ack', jobId: 'j1', status: 'printed', printers: [] }]);
  });
});
