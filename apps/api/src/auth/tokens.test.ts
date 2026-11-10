import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateAgentToken, generatePairingCode, hashToken, normalizePairingCode } from './tokens';

describe('tokens', () => {
  it('gera tokens únicos com prefixo', () => {
    const a = generateAgentToken();
    const b = generateAgentToken();
    assert.match(a, /^agt_[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a, b);
  });

  it('hash é determinístico e não contém o token', () => {
    const token = generateAgentToken();
    assert.equal(hashToken(token), hashToken(token));
    assert.match(hashToken(token), /^[0-9a-f]{64}$/);
    assert.ok(!hashToken(token).includes(token));
  });
});

describe('códigos de pareamento', () => {
  it('têm o formato XXX-XXX sem caracteres ambíguos', () => {
    for (let i = 0; i < 200; i++) {
      const code = generatePairingCode();
      assert.match(code, /^[2-9A-HJKMNP-Z]{3}-[2-9A-HJKMNP-Z]{3}$/);
      assert.equal(normalizePairingCode(code), code);
    }
  });

  it('normaliza o que o usuário digitar', () => {
    assert.equal(normalizePairingCode('k7p2qx'), 'K7P-2QX');
    assert.equal(normalizePairingCode(' K7P 2QX '), 'K7P-2QX');
    assert.equal(normalizePairingCode('k7p-2qx'), 'K7P-2QX');
  });

  it('rejeita códigos inválidos', () => {
    assert.equal(normalizePairingCode('K7P-2Q'), null);
    assert.equal(normalizePairingCode('K7P-2QXX'), null);
    assert.equal(normalizePairingCode('O0I-1LX'), null); // caracteres ambíguos não existem no alfabeto
  });
});
