/** Credenciais do usuário de demonstração criado pelo seed (só para desenvolvimento). */
export const DEMO_USER = {
  name: 'Dono Demo',
  email: 'demo@cardapio.dev',
  password: 'demo12345',
} as const;

/** Funcionário de demonstração (papel STAFF): entra direto no PDV, sem acesso à retaguarda. */
export const DEMO_STAFF = {
  name: 'Garçom Demo',
  email: 'garcom@cardapio.dev',
  password: 'demo12345',
} as const;

export const DEMO_RESTAURANT = { slug: 'demo', name: 'Restaurante Demo' } as const;
