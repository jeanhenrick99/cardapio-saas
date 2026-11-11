import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSearchablePhone, phoneDigits, samePhone } from './phone';

describe('telefones', () => {
  it('compara ignorando formatação e código do país', () => {
    assert.equal(phoneDigits('(11) 98888-1111'), '11988881111');
    assert.ok(samePhone('(11) 98888-1111', '11988881111'));
    assert.ok(samePhone('+55 11 98888-1111', '(11) 98888-1111'));
  });

  it('não confunde números diferentes nem parciais', () => {
    assert.ok(!samePhone('(11) 98888-1111', '(11) 98888-2222'));
    assert.ok(!samePhone('98888-1111', '(11) 98888-1111'), 'sem DDD não basta');
  });

  it('só busca com DDD + número', () => {
    assert.ok(isSearchablePhone('11 98888-1111'));
    assert.ok(!isSearchablePhone('98888-1111'));
  });
});
