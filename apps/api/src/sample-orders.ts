import { randomUUID } from 'node:crypto';
import type { OrderDraftInput } from '@cardapio/shared';

type MenuItem = { name: string; priceCents: number; sector: string; options?: { group: string; name: string; priceCents: number }[] };

const MENU: MenuItem[] = [
  { name: 'X-Burguer', priceCents: 2500, sector: 'cozinha', options: [{ group: 'Adicionais', name: 'Bacon', priceCents: 400 }, { group: 'Adicionais', name: 'Ovo', priceCents: 300 }] },
  { name: 'X-Salada', priceCents: 2300, sector: 'cozinha' },
  { name: 'Batata frita grande', priceCents: 1900, sector: 'cozinha', options: [{ group: 'Molhos', name: 'Cheddar e bacon', priceCents: 600 }] },
  { name: 'Pizza meio a meio: Calabresa / Quatro queijos', priceCents: 6200, sector: 'cozinha', options: [{ group: 'Borda', name: 'Borda de catupiry', priceCents: 900 }] },
  { name: 'Açaí 500ml', priceCents: 2200, sector: 'cozinha', options: [{ group: 'Adicionais', name: 'Leite em pó', priceCents: 200 }, { group: 'Adicionais', name: 'Granola', priceCents: 200 }] },
  { name: 'Coca-Cola lata', priceCents: 700, sector: 'bar' },
  { name: 'Suco de laranja 500ml', priceCents: 1100, sector: 'bar' },
  { name: 'Caipirinha de limão', priceCents: 1800, sector: 'bar' },
  { name: 'Chopp 300ml', priceCents: 1200, sector: 'bar' },
];

const NOTES = ['Sem cebola', 'Ponto da carne: mal passado', 'Pouco gelo', 'Molho à parte'];
const CUSTOMERS = [
  { name: 'Ana Souza', phone: '(11) 98888-1234', address: 'Rua das Palmeiras, 450, apto 12 - Jardim Paulista' },
  { name: 'João Pereira', phone: '(21) 97777-4321', address: 'Av. Atlântica, 1000 - Copacabana' },
];

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;
const chance = (p: number) => Math.random() < p;

/** Gera um pedido aleatório (rascunho: id, número e data vêm do servidor). */
export function sampleOrder(): OrderDraftInput {
  const type = pick(['mesa', 'mesa', 'delivery', 'retirada'] as const);
  const count = 1 + Math.floor(Math.random() * 4);
  const items = Array.from({ length: count }, () => {
    const item = pick(MENU);
    return {
      id: randomUUID(),
      name: item.name,
      quantity: 1 + Math.floor(Math.random() * 2),
      unitPriceCents: item.priceCents,
      sector: item.sector,
      options: item.options?.filter(() => chance(0.5)) ?? [],
      ...(chance(0.3) ? { notes: pick(NOTES) } : {}),
    };
  });

  return {
    type,
    ...(type === 'mesa' ? { table: String(1 + Math.floor(Math.random() * 20)) } : {}),
    ...(type !== 'mesa' ? { customer: pick(CUSTOMERS) } : {}),
    ...(type === 'delivery' ? { deliveryFeeCents: 700 } : {}),
    paymentMethod: pick(['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro']),
    items,
  };
}
