import type { Me, Role } from './types';

export interface RestaurantAccess {
  name: string;
  role: Role;
  /** true quando quem entrou é o administrador da plataforma, sem ser membro (modo suporte). */
  support: boolean;
}

/**
 * Acesso do usuário a um restaurante, a partir do que a sessão já sabe:
 * - membro: o papel dele (dono ou funcionário);
 * - administrador da plataforma que não é membro: 'support' (falta só buscar o nome do restaurante,
 *   e ele entra com os poderes de dono);
 * - qualquer outra pessoa: null (para ela o restaurante não existe).
 */
export function accessFromSession(me: Me, slug: string): RestaurantAccess | 'support' | null {
  const membership = me.restaurants.find((r) => r.slug === slug);
  if (membership) return { name: membership.name, role: membership.role, support: false };
  return me.isPlatformAdmin ? 'support' : null;
}
