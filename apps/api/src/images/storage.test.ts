import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isImageRef } from '@cardapio/shared';
import { TINY_JPEG, TINY_PNG, TINY_WEBP } from './fixtures';
import { sniffImageType } from './storage';

describe('sniffImageType', () => {
  it('reconhece WebP, JPEG e PNG pela assinatura', () => {
    assert.equal(sniffImageType(TINY_WEBP), 'image/webp');
    assert.equal(sniffImageType(TINY_JPEG), 'image/jpeg');
    assert.equal(sniffImageType(TINY_PNG), 'image/png');
  });

  it('recusa arquivos que não são imagem, mesmo com nome de imagem', () => {
    assert.equal(sniffImageType(Buffer.from('<svg onload="alert(1)">')), null);
    assert.equal(sniffImageType(Buffer.from('GIF89a')), null);
    assert.equal(sniffImageType(Buffer.alloc(0)), null);
  });
});

describe('isImageRef', () => {
  it('aceita foto enviada ou link http(s)', () => {
    assert.ok(isImageRef('/api/images/3f2a1b4c-1d2e-4f5a-8b9c-0d1e2f3a4b5c'));
    assert.ok(isImageRef('https://exemplo.com/foto.jpg'));
  });

  it('recusa outros caminhos e esquemas', () => {
    assert.ok(!isImageRef('/api/auth/logout'));
    assert.ok(!isImageRef('javascript:alert(1)'));
    assert.ok(!isImageRef('/api/images/../../auth/me'));
  });
});
