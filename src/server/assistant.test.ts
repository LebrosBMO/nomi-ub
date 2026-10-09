import test from 'node:test';
import assert from 'node:assert/strict';
import { clientAddress, configFromEnv, createAssistant, installIdOf } from './assistant.ts';

const KEY = 'test-only-hosted-app-key-123456';
const hosted = (headers: Record<string, string>) =>
  new Request('https://nomi-ub--abc123.expo.app/api/assistant', { method: 'POST', headers: { host: 'nomi-ub.expo.app', ...headers }, body: '{}' });

test('On EAS Hosting the injected Origin matches the Host, so it passes; any other site is refused', async () => {
  const handle = createAssistant(configFromEnv({ NOMI_ACCESS_TOKEN: KEY }));
  // Same site (what the hosting sets for every call, the phone included): past the origin check, then stopped by the key.
  assert.equal((await handle('assistant', hosted({ origin: 'https://nomi-ub.expo.app' }), 'a')).status, 401);
  assert.equal((await handle('assistant', hosted({ origin: 'https://nomi-ub.expo.app', authorization: 'Bearer ' + KEY }), 'a')).status, 503);
  // On the production alias the hosting reports the deployment address as the origin.
  assert.equal((await handle('assistant', hosted({ origin: 'https://nomi-ub--ckn34llwqb.expo.app' }), 'a')).status, 401);
  assert.equal((await handle('assistant', hosted({ origin: 'https://evil.example' }), 'a')).status, 403);
  assert.equal((await handle('assistant', hosted({ origin: 'https://other-app.expo.app' }), 'a')).status, 403);
  assert.equal((await handle('health', new Request('https://nomi-ub.expo.app/api/health', { headers: { host: 'nomi-ub.expo.app' } }), 'h')).status, 200);
});

test("The per-minute cap counts the caller's forwarded address, not one shared bucket", () => {
  assert.equal(clientAddress(hosted({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1, 10.0.0.1' })), '203.0.113.7');
  assert.equal(clientAddress(hosted({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' })), '198.51.100.1');
  assert.equal(clientAddress(hosted({})), 'unknown');
});

const SECRET = 'test-only-signing-secret-0123456789abcdef';

test('A phone that was not paired gets its own install key from /register, and only an untampered, unblocked key passes', async () => {
  const handle = createAssistant(configFromEnv({ NOMI_SIGNING_SECRET: SECRET, NOMI_BLOCKED_INSTALLS: '' }));
  const res = await handle('register', new Request('https://nomi-ub.expo.app/api/register', { method: 'POST', headers: { host: 'nomi-ub.expo.app' } }), 'r1');
  assert.equal(res.status, 200);
  const { token } = await res.json();
  assert.match(token, /^i1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
  const id = await installIdOf(token, SECRET);
  assert.equal(id, token.split('.')[1]);
  // Past the key check (503: this test server has no OpenAI key), so the key was accepted.
  assert.equal((await handle('assistant', hosted({ authorization: 'Bearer ' + token }), 'a')).status, 503);
  const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
  assert.equal((await handle('assistant', hosted({ authorization: 'Bearer ' + tampered }), 'a')).status, 401);
  assert.equal(await installIdOf(token, SECRET.replace('0', '1')), null);
  const blocked = createAssistant(configFromEnv({ NOMI_SIGNING_SECRET: SECRET, NOMI_BLOCKED_INSTALLS: 'x, ' + id }));
  assert.equal((await blocked('assistant', hosted({ authorization: 'Bearer ' + token }), 'a')).status, 401);
});

test('Registration needs a long signing secret and is limited per address', async () => {
  const off = createAssistant(configFromEnv({ NOMI_SIGNING_SECRET: 'short' }));
  const post = () => new Request('https://nomi-ub.expo.app/api/register', { method: 'POST', headers: { host: 'nomi-ub.expo.app' } });
  assert.equal((await off('register', post(), 'r')).status, 503);
  const handle = createAssistant(configFromEnv({ NOMI_SIGNING_SECRET: SECRET }));
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await handle('register', post(), 'same-address')).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
  assert.equal((await handle('register', post(), 'other-address')).status, 200);
  assert.equal((await handle('register', new Request('https://nomi-ub.expo.app/api/register', { headers: { host: 'nomi-ub.expo.app' } }), 'g')).status, 404);
});
