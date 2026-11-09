import test from 'node:test';
import assert from 'node:assert/strict';
import { readLimitedBody } from '../lib/request-body.ts';

function request(chunks, headers = {}) {
  return new Request('http://localhost/', { method: 'POST', headers, duplex: 'half', body: new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } }) });
}
test('bounded body accepts valid bytes and rejects oversized streamed data', async () => {
  assert.equal(await readLimitedBody(request(['ab', 'cd'], { 'content-length': '4' }), 4), 'abcd');
  await assert.rejects(readLimitedBody(request(['ab', 'cde']), 4), /large/);
  await assert.rejects(readLimitedBody(request(['abc'], { 'content-length': '2' }), 4), /mismatch/);
  await assert.rejects(readLimitedBody(request(['abc'], { 'content-length': '5000' }), 4), /length/);
});
import { verifyTurnstile, turnstileConfig } from '../lib/turnstile.ts';
test('Turnstile fails closed and requires the expected action and hostname', async () => {
  const config = { secret: 'private', hostname: 'admin.example.com' };
  const send = response => async () => Response.json(response);
  assert.equal(await verifyTurnstile('token', config, send({ success: true, action: 'login', hostname: 'admin.example.com' })), true);
  for (const result of [{ success: false }, { success: true, action: 'other', hostname: config.hostname }, { success: true, action: 'login', hostname: 'other.example.com' }]) {
    assert.equal(await verifyTurnstile('token', config, send(result)), false);
  }
  assert.equal(await verifyTurnstile('', config, send({ success: true })), false);
  assert.equal(await verifyTurnstile('x'.repeat(2049), config, send({ success: true })), false);
  assert.equal(await verifyTurnstile('token', config, async () => { throw Error('network'); }), false);
});
test('Turnstile requires complete configuration', () => {
  const keys = ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'TURNSTILE_HOSTNAME'];
  const prior = keys.map(key => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    assert.equal(turnstileConfig(), null);
    process.env.TURNSTILE_SITE_KEY = 'site'; process.env.TURNSTILE_SECRET_KEY = 'secret'; process.env.TURNSTILE_HOSTNAME = 'ADMIN.EXAMPLE.COM';
    assert.equal(turnstileConfig().hostname, 'admin.example.com');
    process.env.TURNSTILE_HOSTNAME = 'https://admin.example.com';
    assert.equal(turnstileConfig(), null);
  } finally { keys.forEach((key, i) => prior[i] === undefined ? delete process.env[key] : process.env[key] = prior[i]); }
});
