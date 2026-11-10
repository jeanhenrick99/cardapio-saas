import { randomUUID } from 'node:crypto';
import type { Checkout, OrderDraft, OrderItem } from '@cardapio/shared';

/** Produto como vem do banco, com os dados necessários para precificar. */
export interface PricingProduct {
  id: string;
  name: string;
  priceCents: number;
  sector: string;
  active: boolean;
  categoryActive: boolean;
  optionGroups: {
    id: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    options: { id: string; name: string; priceCents: number; active: boolean }[];
  }[];
}

/** Erro de regra de negócio no carrinho: vira HTTP 422 com mensagem para o cliente. */
export class CheckoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckoutError';
  }
}

/**
 * Transforma o carrinho do cliente (só IDs) em um pedido com preços do banco.
 * Função pura: não acessa o banco, então é fácil de testar.
 *
 * Regras:
 * - produto precisa existir, estar ativo e com a categoria ativa
 * - cada grupo respeita o mínimo e o máximo de escolhas
 * - opções precisam pertencer ao produto e estar ativas
 */
export function buildOrderDraft(checkout: Checkout, products: Map<string, PricingProduct>): OrderDraft {
  const items: OrderItem[] = checkout.items.map((item, index) => {
    const label = `Item ${index + 1}`;
    const product = products.get(item.productId);
    if (!product || !product.active || !product.categoryActive) {
      throw new CheckoutError(`${label}: produto indisponível`);
    }

    const remaining = new Set(item.optionIds);
    if (remaining.size !== item.optionIds.length) {
      throw new CheckoutError(`${label} (${product.name}): opção repetida`);
    }

    const options: OrderItem['options'] = [];
    for (const group of product.optionGroups) {
      const picked = group.options.filter((o) => remaining.has(o.id));
      picked.forEach((o) => remaining.delete(o.id));

      const unavailable = picked.find((o) => !o.active);
      if (unavailable) throw new CheckoutError(`${label} (${product.name}): "${unavailable.name}" está indisponível`);
      if (picked.length < group.minSelect) {
        throw new CheckoutError(`${label} (${product.name}): escolha pelo menos ${group.minSelect} em "${group.name}"`);
      }
      if (picked.length > group.maxSelect) {
        throw new CheckoutError(`${label} (${product.name}): escolha no máximo ${group.maxSelect} em "${group.name}"`);
      }
      options.push(...picked.map((o) => ({ group: group.name, name: o.name, priceCents: o.priceCents })));
    }

    if (remaining.size > 0) {
      throw new CheckoutError(`${label} (${product.name}): opção não pertence a este produto`);
    }

    return {
      id: randomUUID(),
      name: product.name,
      quantity: item.quantity,
      unitPriceCents: product.priceCents,
      sector: product.sector,
      options,
      ...(item.notes ? { notes: item.notes } : {}),
    };
  });

  return {
    type: checkout.type,
    ...(checkout.table ? { table: checkout.table } : {}),
    ...(checkout.customer ? { customer: checkout.customer } : {}),
    ...(checkout.notes ? { notes: checkout.notes } : {}),
    ...(checkout.paymentMethod ? { paymentMethod: checkout.paymentMethod } : {}),
    items,
    deliveryFeeCents: 0,
    discountCents: 0,
  };
}
