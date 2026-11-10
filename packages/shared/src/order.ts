import { z } from 'zod';

/**
 * Valores monetários são sempre inteiros em centavos.
 * Evita erros de ponto flutuante (0.1 + 0.2 !== 0.3).
 */
const cents = z.number().int().nonnegative();

export const OrderItemOptionSchema = z.object({
  group: z.string(), // ex.: "Adicionais", "Ponto da carne"
  name: z.string(), // ex.: "Bacon"
  priceCents: cents.default(0),
});

export const OrderItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.number().int().positive(),
  unitPriceCents: cents,
  /** Setor de produção: usado para rotear o item para a impressora certa. */
  sector: z.string(),
  options: z.array(OrderItemOptionSchema).default([]),
  notes: z.string().optional(),
});

export const OrderTypeSchema = z.enum(['mesa', 'delivery', 'retirada']);

export const OrderSchema = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true }),
  type: OrderTypeSchema,
  table: z.string().optional(),
  customer: z
    .object({
      name: z.string(),
      phone: z.string().optional(),
      address: z.string().optional(),
    })
    .optional(),
  items: z.array(OrderItemSchema).min(1),
  notes: z.string().optional(),
  deliveryFeeCents: cents.default(0),
  discountCents: cents.default(0),
  paymentMethod: z.string().optional(),
});

export type OrderItemOption = z.infer<typeof OrderItemOptionSchema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;
export type OrderType = z.infer<typeof OrderTypeSchema>;
export type Order = z.infer<typeof OrderSchema>;
/** Formato aceito na entrada (campos com default são opcionais). */
export type OrderInput = z.input<typeof OrderSchema>;

export function itemTotalCents(item: OrderItem): number {
  const optionsCents = item.options.reduce((sum, o) => sum + o.priceCents, 0);
  return (item.unitPriceCents + optionsCents) * item.quantity;
}

export function orderSubtotalCents(order: Order): number {
  return order.items.reduce((sum, item) => sum + itemTotalCents(item), 0);
}

export function orderTotalCents(order: Order): number {
  return Math.max(0, orderSubtotalCents(order) + order.deliveryFeeCents - order.discountCents);
}

/** Formata centavos como "R$ 1.234,56" sem depender do ICU do sistema. */
export function formatBRL(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const centavos = (abs % 100).toString().padStart(2, '0');
  return `${sign}R$ ${reais},${centavos}`;
}
