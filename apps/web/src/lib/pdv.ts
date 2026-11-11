import type { CheckoutInput, MenuProduct } from '@cardapio/shared';
import type { AdminCategory } from './menu-editor';
import { toCheckoutItems, type CartLine } from './cart';

/** Produto sem complementos entra no pedido com um toque; os outros abrem a janela de opções. */
export const isQuickAdd = (product: MenuProduct) => product.optionGroups.length === 0;

export type PdvOrderType = 'mesa' | 'comanda' | 'retirada' | 'delivery';

export interface PdvForm {
  type: PdvOrderType;
  table: string;
  name: string;
  phone: string;
  address: string;
  paymentMethod: string;
  notes: string;
}

export const emptyPdvForm = (type: PdvOrderType = 'mesa'): PdvForm => ({
  type,
  table: '',
  name: '',
  phone: '',
  address: '',
  paymentMethod: 'Pix',
  notes: '',
});

/** Monta o pedido do PDV e lista o que falta preencher (em português). */
export function buildPdvCheckout(lines: CartLine[], form: PdvForm): { checkout: CheckoutInput | null; errors: string[] } {
  const errors: string[] = [];
  if (lines.length === 0) errors.push('Adicione pelo menos um produto.');
  const name = form.name.trim();
  const phone = form.phone.trim();
  const address = form.address.trim();
  const table = form.table.trim();

  const isTab = form.type === 'mesa' || form.type === 'comanda';
  if (form.type === 'mesa' && !table) errors.push('Informe o número da mesa.');
  if (form.type === 'comanda' && !table) errors.push('Informe o número da comanda.');
  if (!isTab && !name) errors.push('Informe o nome do cliente.');
  if (form.type === 'delivery' && !phone) errors.push('Informe o telefone para o delivery.');
  if (form.type === 'delivery' && !address) errors.push('Informe o endereço de entrega.');
  if (errors.length) return { checkout: null, errors };

  return {
    errors,
    checkout: {
      type: form.type,
      ...(isTab ? { table } : {}),
      ...(!isTab
        ? { customer: { name, ...(phone ? { phone } : {}), ...(form.type === 'delivery' ? { address } : {}) } }
        : {}),
      items: toCheckoutItems(lines),
      ...(form.paymentMethod ? { paymentMethod: form.paymentMethod } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    },
  };
}

/** Produto do PDV: igual ao do cardápio, mais a marcação de esgotado. */
export interface PdvProduct extends MenuProduct {
  soldOut: boolean;
}

export interface PdvCategory {
  id: string;
  name: string;
  products: PdvProduct[];
}

/**
 * Converte o cardápio completo (da equipe) para o PDV: categorias ocultas saem,
 * produtos esgotados ficam (para a equipe ver e reativar), opções esgotadas saem.
 */
export function toPdvCategories(categories: AdminCategory[]): PdvCategory[] {
  return categories
    .filter((c) => c.active)
    .map((c) => ({
      id: c.id,
      name: c.name,
      products: c.products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        imageUrl: p.imageUrl,
        featured: p.featured,
        soldOut: !p.active,
        optionGroups: p.optionGroups.map((g) => ({
          id: g.id,
          name: g.name,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          options: g.options.filter((o) => o.active).map((o) => ({ id: o.id, name: o.name, priceCents: o.priceCents })),
        })),
      })),
    }))
    .filter((c) => c.products.length > 0);
}
