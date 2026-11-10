import { z } from 'zod';

export const SlugSchema = z
  .string()
  .min(2)
  .max(50)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use apenas letras minúsculas, números e hífens');

export const RestaurantInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: SlugSchema,
});

export const EmailSchema = z.string().trim().toLowerCase().email('E-mail inválido').max(255);
export const PasswordSchema = z.string().min(8, 'A senha precisa de pelo menos 8 caracteres').max(200);
