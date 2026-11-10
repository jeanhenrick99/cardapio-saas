import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OrderSchema, formatBRL, orderTotalCents } from '@cardapio/shared';
import { renderPreview } from '../printers/virtual';
import { buildTicket, itemsForPrinter } from './receipt';

const order = OrderSchema.parse({
  id: 'o1',
  number: 42,
  createdAt: '2026-11-10T19:30:00-03:00',
  type: 'delivery',
  customer: { name: 'Maria', phone: '(11) 99999-0000', address: 'Rua das Flores, 123 - Centro' },
  items: [
    { id: 'a', name: 'X-Burguer', quantity: 2, unitPriceCents: 2500, sector: 'cozinha', options: [{ group: 'Adicionais', name: 'Bacon', priceCents: 400 }], notes: 'Sem cebola' },
    { id: 'b', name: 'Suco de laranja', quantity: 1, unitPriceCents: 900, sector: 'bar' },
  ],
  deliveryFeeCents: 700,
  discountCents: 500,
  paymentMethod: 'Pix',
});

describe('totais e formatação', () => {
  it('soma itens, adicionais, taxa e desconto em centavos', () => {
    // (25 + 4) * 2 + 9 + 7 - 5 = 69
    assert.equal(orderTotalCents(order), 6900);
  });

  it('formata em reais', () => {
    assert.equal(formatBRL(6900), 'R$ 69,00');
    assert.equal(formatBRL(123456789), 'R$ 1.234.567,89');
    assert.equal(formatBRL(-500), '-R$ 5,00');
  });
});

describe('roteamento por setor', () => {
  it('envia cada item só para a impressora do seu setor', () => {
    assert.deepEqual(itemsForPrinter(order, { sectors: ['cozinha'] }).map((i) => i.id), ['a']);
    assert.deepEqual(itemsForPrinter(order, { sectors: ['bar'] }).map((i) => i.id), ['b']);
    assert.deepEqual(itemsForPrinter(order, { sectors: ['sobremesa'] }), []);
  });

  it('"*" recebe todos os itens', () => {
    assert.equal(itemsForPrinter(order, { sectors: ['*'] }).length, 2);
  });
});

describe('buildTicket', () => {
  for (const columns of [32, 48] as const) {
    it(`nenhuma linha ultrapassa ${columns} colunas`, () => {
      const receipt = buildTicket(order, order.items, { title: 'Caixa', columns, showPrices: true });
      for (const line of receipt.lines) {
        if (line.kind !== 'text') continue;
        const width = line.text.length * (line.size ?? 1);
        assert.ok(width <= columns, `"${line.text}" tem ${width} colunas`);
      }
    });
  }

  it('via da cozinha não mostra preços', () => {
    const preview = renderPreview(buildTicket(order, itemsForPrinter(order, { sectors: ['cozinha'] }), { title: 'Cozinha', columns: 48, showPrices: false })).join('\n');
    assert.match(preview, /2x X-Burguer/);
    assert.match(preview, /\+ Bacon/);
    assert.match(preview, /OBS: Sem cebola/);
    assert.match(preview, /P E D I D O {3}# 0 0 4 2/);
    assert.doesNotMatch(preview, /R\$/);
    assert.doesNotMatch(preview, /Suco/);
  });

  it('via do caixa mostra itens, totais e pagamento', () => {
    const preview = renderPreview(buildTicket(order, order.items, { title: 'Caixa', columns: 48, showPrices: true })).join('\n');
    assert.match(preview, /2x X-Burguer +R\$ 58,00/);
    assert.match(preview, /Desconto +-R\$ 5,00/);
    assert.match(preview, /TOTAL +R\$ 69,00/);
    assert.match(preview, /Pagamento: Pix/);
    assert.match(preview, /DELIVERY/);
  });

  it('termina com avanço de papel e corte', () => {
    const receipt = buildTicket(order, order.items, { title: 'x', columns: 32, showPrices: false });
    assert.deepEqual(receipt.lines.slice(-2), [{ kind: 'feed', lines: 2 }, { kind: 'cut' }]);
  });
});
