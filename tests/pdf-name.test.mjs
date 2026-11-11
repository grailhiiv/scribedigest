import test from 'node:test';
import assert from 'node:assert/strict';
import { safePdfName, validR2PdfName, suffixedPdfName } from '../lib/pdf-name.ts';

test('preserves ordinary names and removes path and unsafe filename characters', () => {
  assert.equal(safePdfName('My Book - 2026.pdf'), 'My Book - 2026.pdf');
  assert.equal(safePdfName('C:\\uploads\\Book: Issue?.PDF'), 'Book_ Issue_.pdf');
  assert.equal(safePdfName('../../Secret.pdf'), 'Secret.pdf');
  assert.equal(safePdfName('document.txt'), null);
  assert.equal(safePdfName('...pdf'), null);
  assert.equal(validR2PdfName('../Secret.pdf'), false);
});

test('long unicode names and collision suffixes fit the safe key limit', () => {
  const name = safePdfName(`${'書'.repeat(100)}.pdf`);
  const suffixed = suffixedPdfName(name, '12345678-1234-4123-8123-123456789abc');
  assert.equal(validR2PdfName(name), true);
  assert.equal(validR2PdfName(suffixed), true);
  assert.ok(suffixed.endsWith('-12345678-1234-4123-8123-123456789abc.pdf'));
});
