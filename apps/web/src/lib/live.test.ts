import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reconnectDelay } from './live';

describe('reconnectDelay', () => {
  it('dobra a espera a cada tentativa, até 30 s', () => {
    assert.deepEqual([0, 1, 2, 3, 4].map(reconnectDelay), [1000, 2000, 4000, 8000, 16000]);
    assert.equal(reconnectDelay(5), 30_000);
    assert.equal(reconnectDelay(50), 30_000);
  });
});
