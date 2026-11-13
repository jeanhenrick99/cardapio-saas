import type { NextConfig } from 'next';

const API_URL = process.env.API_URL ?? 'http://localhost:8080';

const config: NextConfig = {
  // O pacote shared exporta TypeScript puro: o Next compila junto.
  transpilePackages: ['@cardapio/shared'],
  // Sem o selo flutuante do Next no modo de desenvolvimento (ele cobre a barra do PDV no celular).
  devIndicators: false,
  // O navegador fala com /api/* no mesmo domínio do site, e o Next repassa para a API.
  // Assim os cookies de sessão funcionam sem configurar CORS.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
};

export default config;
