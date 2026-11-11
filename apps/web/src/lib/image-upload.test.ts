import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fitWithin } from './image-upload';

describe('fitWithin', () => {
  it('reduz mantendo a proporção', () => {
    assert.deepEqual(fitWithin(4000, 3000, 1200), { width: 1200, height: 900 });
    assert.deepEqual(fitWithin(3000, 4000, 1200), { width: 900, height: 1200 });
  });

  it('nunca aumenta fotos pequenas', () => {
    assert.deepEqual(fitWithin(800, 600, 1200), { width: 800, height: 600 });
  });

  it('lida com dimensões inválidas', () => {
    assert.deepEqual(fitWithin(0, 100, 1200), { width: 0, height: 0 });
  });
});
