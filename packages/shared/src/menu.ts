import { z } from 'zod';
import { OrderTypeSchema } from './order';

// ---------- Cardápio público (o que o cliente vê) ----------

export interface MenuOption {
  id: string;
  name: string;
  priceCents: number;
}

export interface MenuOptionGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: MenuOption[];
}

export interface MenuProduct {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  optionGroups: MenuOptionGroup[];
}

export interface MenuCategory {
  id: string;
  name: string;
  products: MenuProduct[];
}

export interface PublicMenu {
  restaurant: { name: string; slug: string };
  categories: MenuCategory[];
}

// ---------- Carrinho / checkout (o que o cliente envia) ----------

/**
 * O cliente envia só IDs e quantidades, nunca preços: o servidor busca
 * os preços no banco. Assim ninguém consegue alterar o valor do pedido
 * editando a requisição.
 */
export const CartItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
  optionIds: z.array(z.string().uuid()).max(50).default([]),
  notes: z.string().trim().max(200).optional(),
});

export const CheckoutSchema = z
  .object({
    type: OrderTypeSchema,
    table: z.string().trim().min(1).max(20).optional(),
    customer: z
      .object({
        name: z.string().trim().min(1).max(100),
        phone: z.string().trim().max(30).optional(),
        address: z.string().trim().max(300).optional(),
      })
      .optional(),
    items: z.array(CartItemSchema).min(1).max(50),
    notes: z.string().trim().max(500).optional(),
    paymentMethod: z.string().trim().max(50).optional(),
  })
  .superRefine((c, ctx) => {
    if (c.type === 'mesa' && !c.table) {
      ctx.addIssue({ code: 'custom', path: ['table'], message: 'Informe o número da mesa' });
    }
    if (c.type !== 'mesa' && !c.customer) {
      ctx.addIssue({ code: 'custom', path: ['customer'], message: 'Informe o nome do cliente' });
    }
    if (c.type === 'delivery' && (!c.customer?.address || !c.customer.phone)) {
      ctx.addIssue({ code: 'custom', path: ['customer'], message: 'Delivery precisa de endereço e telefone' });
    }
  });

export type CartItem = z.infer<typeof CartItemSchema>;
export type Checkout = z.infer<typeof CheckoutSchema>;
export type CheckoutInput = z.input<typeof CheckoutSchema>;
