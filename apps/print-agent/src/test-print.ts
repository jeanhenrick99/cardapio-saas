/**
 * "Imprimir teste": manda um cupom de exemplo para todas as impressoras
 * configuradas, sem precisar do servidor. Útil para validar acentos,
 * largura do papel e conexão com impressoras de rede.
 */
import { OrderSchema } from '@cardapio/shared';
import { loadConfig } from './config';
import { encodeEscPos } from './escpos/encoder';
import { log } from './log';
import { createDrivers } from './printers';
import { buildTicket } from './render/receipt';

const order = OrderSchema.parse({
  id: 'teste',
  number: 1,
  createdAt: new Date().toISOString(),
  type: 'mesa',
  table: '0',
  items: [
    { id: '1', name: 'Pão de queijo', quantity: 2, unitPriceCents: 650, sector: 'cozinha' },
    { id: '2', name: 'Açaí 500ml', quantity: 1, unitPriceCents: 2200, sector: 'cozinha', options: [{ group: 'Adicionais', name: 'Granola', priceCents: 300 }] },
    { id: '3', name: 'Café com leite', quantity: 1, unitPriceCents: 800, sector: 'bar', notes: 'Açúcar à parte' },
  ],
  notes: 'Teste de impressão: ÁÉÍÓÚ áéíóú ÂÊÔ âêô ÃÕ ãõ Çç À à º ª °',
});

const config = loadConfig();
const drivers = createDrivers(config.printers);
let failed = 0;

for (const printer of config.printers) {
  const receipt = buildTicket(order, order.items, {
    title: `TESTE ${printer.name}`,
    columns: printer.columns,
    showPrices: true,
  });
  try {
    await drivers.get(printer.name)!.print({ jobId: 'teste', receipt, bytes: encodeEscPos(receipt) });
    log.info(`✔ Teste enviado para "${printer.name}"`);
  } catch (err) {
    failed++;
    log.error(`"${printer.name}": ${err instanceof Error ? err.message : String(err)}`);
  }
}
process.exit(failed > 0 ? 1 : 0);
