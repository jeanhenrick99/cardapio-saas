import type { CheckoutInput, MenuProduct } from '@cardapio/shared';
import { toCheckoutItems, type CartLine } from './cart';

/** Produto sem complementos entra no pedido com um toque; os outros abrem a janela de opções. */
export const isQuickAdd = (product: MenuProduct) => product.optionGroups.length === 0;

export type PdvOrderType = 'mesa' | 'retirada' | 'delivery';

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

  if (form.type === 'mesa' && !table) errors.push('Informe o número da mesa.');
  if (form.type !== 'mesa' && !name) errors.push('Informe o nome do cliente.');
  if (form.type === 'delivery' && !phone) errors.push('Informe o telefone para o delivery.');
  if (form.type === 'delivery' && !address) errors.push('Informe o endereço de entrega.');
  if (errors.length) return { checkout: null, errors };

  return {
    errors,
    checkout: {
      type: form.type,
      ...(form.type === 'mesa' ? { table } : {}),
      ...(form.type !== 'mesa'
        ? { customer: { name, ...(phone ? { phone } : {}), ...(form.type === 'delivery' ? { address } : {}) } }
        : {}),
      items: toCheckoutItems(lines),
      ...(form.paymentMethod ? { paymentMethod: form.paymentMethod } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    },
  };
}
