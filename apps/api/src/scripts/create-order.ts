/**
 * Simula um cliente: lê o cardápio público, monta um carrinho aleatório
 * (respeitando mínimos e máximos dos complementos) e faz o pedido.
 *
 *   npm run order            → restaurante "demo"
 *   npm run order -- outro   → restaurante "outro"
 */
import { formatBRL, type CheckoutInput, type MenuProduct, type PublicMenu } from '@cardapio/shared';
import { API_URL } from './client';

const slug = process.argv[2] ?? 'demo';

const menuRes = await fetch(`${API_URL}/public/restaurants/${slug}/menu`);
if (!menuRes.ok) {
  console.error(`✖ Não foi possível ler o cardápio (HTTP ${menuRes.status}). A API está rodando e o seed foi feito?`);
  process.exit(1);
}
const menu = (await menuRes.json()) as PublicMenu;
const products = menu.categories.flatMap((c) => c.products);
if (products.length === 0) {
  console.error('✖ O cardápio está vazio.');
  process.exit(1);
}

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(list: T[]): T => list[rand(list.length)]!;
const shuffle = <T>(list: T[]) => [...list].sort(() => Math.random() - 0.5);

function randomOptions(product: MenuProduct): string[] {
  return product.optionGroups.flatMap((g) => {
    const count = g.minSelect + rand(Math.min(g.maxSelect, g.options.length) - g.minSelect + 1);
    return shuffle(g.options).slice(0, count).map((o) => o.id);
  });
}

const checkout: CheckoutInput = {
  type: 'mesa',
  table: String(1 + rand(20)),
  paymentMethod: pick(['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro']),
  items: Array.from({ length: 1 + rand(4) }, () => {
    const product = pick(products);
    return {
      productId: product.id,
      quantity: 1 + rand(2),
      optionIds: randomOptions(product),
      ...(Math.random() < 0.25 ? { notes: pick(['Sem cebola', 'Caprichar no molho', 'Pouco gelo']) } : {}),
    };
  }),
};

const res = await fetch(`${API_URL}/public/restaurants/${slug}/orders`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(checkout),
});
const body = (await res.json()) as { number?: number; totalCents?: number; error?: string };
if (!res.ok) {
  console.error(`✖ HTTP ${res.status}: ${body.error ?? JSON.stringify(body)}`);
  process.exit(1);
}
console.log(`✔ Pedido #${body.number} da mesa ${checkout.table}: ${formatBRL(body.totalCents ?? 0)}`);
