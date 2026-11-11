import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTableLinks, isLocalOnly, MAX_TABLES, normalizeBaseUrl } from './table-links';

describe('normalizeBaseUrl', () => {
  it('completa o protocolo e remove a barra final', () => {
    assert.equal(normalizeBaseUrl('192.168.0.10:3000/'), 'http://192.168.0.10:3000');
    assert.equal(normalizeBaseUrl('https://meurestaurante.com.br/'), 'https://meurestaurante.com.br');
    assert.equal(normalizeBaseUrl('http://localhost:3000'), 'http://localhost:3000');
  });

  it('recusa endereços inválidos', () => {
    assert.equal(normalizeBaseUrl(''), null);
    assert.equal(normalizeBaseUrl('meu restaurante'), null);
    assert.equal(normalizeBaseUrl('abc'), null);
  });
});

describe('isLocalOnly', () => {
  it('identifica endereços que não abrem no celular', () => {
    assert.equal(isLocalOnly('http://localhost:3000'), true);
    assert.equal(isLocalOnly('http://127.0.0.1:3000'), true);
    assert.equal(isLocalOnly('http://192.168.0.10:3000'), false);
    assert.equal(isLocalOnly('https://meurestaurante.com.br'), false);
  });
});

describe('buildTableLinks', () => {
  const base = 'http://192.168.0.10:3000';

  it('gera um link por mesa a partir do número inicial', () => {
    const links = buildTableLinks(base, 'demo', { from: 5, count: 3, includeGeneral: false });
    assert.deepEqual(links, [
      { table: '5', url: 'http://192.168.0.10:3000/r/demo?mesa=5' },
      { table: '6', url: 'http://192.168.0.10:3000/r/demo?mesa=6' },
      { table: '7', url: 'http://192.168.0.10:3000/r/demo?mesa=7' },
    ]);
  });

  it('inclui o QR geral (retirada/delivery) primeiro', () => {
    const links = buildTableLinks(base, 'demo', { from: 1, count: 1, includeGeneral: true });
    assert.deepEqual(links[0], { table: null, url: 'http://192.168.0.10:3000/r/demo' });
    assert.equal(links.length, 2);
  });

  it('respeita os limites', () => {
    assert.equal(buildTableLinks(base, 'demo', { from: 1, count: 10_000, includeGeneral: false }).length, MAX_TABLES);
    assert.equal(buildTableLinks(base, 'demo', { from: -3, count: 1, includeGeneral: false })[0]?.table, '1');
    assert.equal(buildTableLinks(base, 'demo', { from: 1, count: -1, includeGeneral: false }).length, 0);
  });
});
