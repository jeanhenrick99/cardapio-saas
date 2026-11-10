import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { encodeCp860 } from './cp860';

describe('encodeCp860', () => {
  it('mantém ASCII como está', () => {
    assert.deepEqual([...encodeCp860('Mesa 7')], [...Buffer.from('Mesa 7', 'ascii')]);
  });

  it('converte acentos do português para 1 byte cada', () => {
    assert.deepEqual([...encodeCp860('Pão')], [0x50, 0x84, 0x6f]);
    assert.deepEqual([...encodeCp860('Ç ç')], [0x80, 0x20, 0x87]);
    assert.deepEqual([...encodeCp860('ÁÉÍÓÚ')], [0x86, 0x90, 0x8b, 0x9f, 0x96]);
  });

  it('aceita texto em forma decomposta (NFD)', () => {
    assert.deepEqual([...encodeCp860('ã')], [0x84]); // "a" + til combinado = "ã"
  });

  it('usa substitutos para caracteres fora da tabela', () => {
    assert.equal(encodeCp860('R$ 10 – ok…').toString('latin1'), 'R$ 10 - ok...');
    assert.equal(encodeCp860('Ő😀').toString('latin1'), 'O?');
  });
});
