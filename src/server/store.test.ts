import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore, storeFromEnv, upstashStore } from './store.ts';

test('The memory store counts per field, reads JSON back and keeps the claim list newest first', async () => {
  const store = memoryStore();
  assert.deepEqual(await store.hgetall('c:p1:2026-10'), {});
  assert.equal(await store.hincrby('c:p1:2026-10', 'view', 1), 1);
  assert.equal(await store.hincrby('c:p1:2026-10', 'view', 1), 2);
  await store.hincrby('c:p1:2026-10', 'call', 1);
  assert.deepEqual(await store.hgetall('c:p1:2026-10'), { view: '2', call: '1' });
  // Another month and another business are other keys.
  assert.deepEqual(await store.hgetall('c:p1:2026-09'), {});
  assert.deepEqual(await store.hgetall('c:p2:2026-10'), {});

  await store.set('claim:a', { id: 'a', status: 'pending' });
  assert.deepEqual(await store.get('claim:a'), { id: 'a', status: 'pending' });
  assert.equal(await store.get('claim:missing'), null);
  // A copy goes in, so a later change to the object the caller kept never reaches the store.
  const draft = { id: 'b', status: 'pending' };
  await store.set('claim:b', draft);
  draft.status = 'approved';
  assert.deepEqual(await store.get('claim:b'), { id: 'b', status: 'pending' });

  for (const id of ['a', 'b', 'c']) await store.push('claims:claim', id);
  assert.deepEqual(await store.list('claims:claim', 10), ['c', 'b', 'a']);
  assert.deepEqual(await store.list('claims:claim', 2), ['c', 'b']);
  assert.deepEqual(await store.list('claims:partner', 10), []);
});

test('A rate-limit step counts inside its own window, and a value with a lifetime goes on its own', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
  const store = memoryStore();
  assert.equal(await store.bump('rl:ev:abc:0', 120), 1);
  assert.equal(await store.bump('rl:ev:abc:0', 120), 2);
  // Another install, and the next minute, each start at one.
  assert.equal(await store.bump('rl:ev:other:0', 120), 1);
  assert.equal(await store.bump('rl:ev:abc:1', 120), 1);
  await store.set('short', { a: 1 }, 60);
  t.mock.timers.tick(59_000);
  assert.deepEqual(await store.get('short'), { a: 1 });
  t.mock.timers.tick(2_000);
  assert.equal(await store.get('short'), null);
  // Past the two minutes a rate-limit key lives, the same key starts again from one.
  t.mock.timers.tick(60_000);
  assert.equal(await store.bump('rl:ev:abc:0', 120), 1);
  assert.deepEqual(store.keys(), ['rl:ev:abc:0']);
});

test('In production without the Upstash variables there is no store at all; dev and tests get one in memory', () => {
  assert.equal(storeFromEnv({ NODE_ENV: 'production' }), null);
  assert.ok(storeFromEnv({}));
  assert.ok(storeFromEnv({ NODE_ENV: 'production', UPSTASH_REDIS_REST_URL: 'https://example.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'token' }));
});

test('The Upstash adapter speaks the REST API: one command to the base URL, a pipeline for a rate-limit step', async () => {
  const calls: { url: string; body: unknown }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ url: String(url), body });
    if (Array.isArray(body[0])) return new Response(JSON.stringify([{ result: 7 }, { result: 1 }]));
    if (body[0] === 'HGETALL') return new Response(JSON.stringify({ result: ['view', '3', 'call', '1'] }));
    if (body[0] === 'GET') return new Response(JSON.stringify({ result: '{"id":"a"}' }));
    return new Response(JSON.stringify({ result: 'OK' }));
  }) as typeof fetch;
  try {
    const store = upstashStore('https://example.upstash.io/', 'token');
    assert.deepEqual(await store.hgetall('c:p1:2026-10'), { view: '3', call: '1' });
    assert.deepEqual(await store.get('claim:a'), { id: 'a' });
    assert.equal(await store.bump('rl:ev:abc:1', 120), 7);
    await store.set('claim:b', { id: 'b' }, 60);
    assert.deepEqual(
      calls.map((c) => c.url),
      ['https://example.upstash.io', 'https://example.upstash.io', 'https://example.upstash.io/pipeline', 'https://example.upstash.io']
    );
    assert.deepEqual(calls[2].body, [
      ['INCR', 'rl:ev:abc:1'],
      ['EXPIRE', 'rl:ev:abc:1', 120],
    ]);
    assert.deepEqual(calls[3].body, ['SET', 'claim:b', '{"id":"b"}', 'EX', 60]);
  } finally {
    globalThis.fetch = original;
  }
});

test('An unreachable or complaining database throws, so the routes can answer 503', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'WRONGTYPE' }))) as typeof fetch;
  try {
    await assert.rejects(() => upstashStore('https://example.upstash.io', 'token').hincrby('c:p1:2026-10', 'view', 1));
  } finally {
    globalThis.fetch = original;
  }
});
