import test from 'node:test';
import assert from 'node:assert/strict';
import { configureEvents, eventSender, recordPlaceEvent } from './events.ts';
import { memoryInstallKeys } from './install.ts';

const API = 'https://example.test/api';
/** Every count is fire and forget, so the test waits a turn for the requests it started. */
const flush = async () => {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};
function fakeFetch(answer: (url: string) => Response | Promise<Response>) {
  const calls: { url: string; body: unknown; authorization: string }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null, authorization: headers.Authorization ?? '' });
    return answer(String(url));
  }) as typeof fetch;
  return { calls, impl };
}
const ok = () => new Response(JSON.stringify({ ok: true }));

test('Nothing is counted before the terms are accepted', async () => {
  const { calls, impl } = fakeFetch((url) => (url.endsWith('/register') ? new Response(JSON.stringify({ token: 'i1.fresh-key' })) : ok()));
  // The app installs the sender only once the first screen has been accepted; until then there is none.
  configureEvents(null);
  recordPlaceEvent('apteka:2086', 'view');
  await flush();
  assert.equal(calls.length, 0);
  configureEvents({ apiUrl: API, keys: memoryInstallKeys(), fetchImpl: impl });
  recordPlaceEvent('apteka:2086', 'view');
  await flush();
  assert.deepEqual(calls.map((c) => c.url), [API + '/register', API + '/events']);
  // And it stops again after "delete my data".
  configureEvents(null);
  recordPlaceEvent('apteka:2086', 'call');
  await flush();
  assert.equal(calls.length, 2);
});

test('A count carries the business, the kind and this install key, and nothing else', async () => {
  const keys = memoryInstallKeys();
  await keys.set('i1.already-held-key');
  const { calls, impl } = fakeFetch(ok);
  const send = eventSender({ apiUrl: API, keys, fetchImpl: impl });
  send('apteka:2086', 'view');
  send('apteka:2086', 'call');
  await flush();
  assert.deepEqual(calls, [
    { url: API + '/events', body: { placeId: 'apteka:2086', kind: 'view' }, authorization: 'Bearer i1.already-held-key' },
    { url: API + '/events', body: { placeId: 'apteka:2086', kind: 'call' }, authorization: 'Bearer i1.already-held-key' },
  ]);
});

test('An install without a key asks for one once, however many counts are waiting', async () => {
  const keys = memoryInstallKeys();
  const { calls, impl } = fakeFetch((url) => (url.endsWith('/register') ? new Response(JSON.stringify({ token: 'i1.fresh-key' })) : ok()));
  const send = eventSender({ apiUrl: API, keys, fetchImpl: impl });
  send('p1', 'view');
  send('p2', 'view');
  await flush();
  assert.equal(calls.filter((c) => c.url.endsWith('/register')).length, 1);
  assert.equal(await keys.get(), 'i1.fresh-key');
  assert.deepEqual(calls.filter((c) => c.url.endsWith('/events')).map((c) => c.authorization), ['Bearer i1.fresh-key', 'Bearer i1.fresh-key']);
});

test('A failed count is dropped in silence and never tried again', async () => {
  const keys = memoryInstallKeys();
  await keys.set('i1.held-key');
  let attempts = 0;
  const impl = (async () => {
    attempts++;
    throw new Error('offline');
  }) as unknown as typeof fetch;
  const send = eventSender({ apiUrl: API, keys, fetchImpl: impl });
  send('p1', 'view');
  await flush();
  assert.equal(attempts, 1);
  // A server error is dropped just as quietly, and the key is kept.
  const failing = fakeFetch(() => new Response(JSON.stringify({ error: 'store_not_configured' }), { status: 503 }));
  eventSender({ apiUrl: API, keys, fetchImpl: failing.impl })('p1', 'map');
  await flush();
  assert.equal(failing.calls.length, 1);
  assert.equal(await keys.get(), 'i1.held-key');
});

test('A key the server no longer accepts is dropped, so the next count asks for a new one', async () => {
  const keys = memoryInstallKeys();
  await keys.set('i1.stale-key');
  let refuse = true;
  const { calls, impl } = fakeFetch((url) => {
    if (url.endsWith('/register')) return new Response(JSON.stringify({ token: 'i1.fresh-key' }));
    if (refuse) {
      refuse = false;
      return new Response(JSON.stringify({ error: 'pairing_required' }), { status: 401 });
    }
    return ok();
  });
  const send = eventSender({ apiUrl: API, keys, fetchImpl: impl });
  send('p1', 'view');
  await flush();
  assert.equal(await keys.get(), null);
  // The refused count itself is not sent again; the next one registers and goes through.
  send('p1', 'call');
  await flush();
  assert.deepEqual(calls.map((c) => c.url), [API + '/events', API + '/register', API + '/events']);
  assert.equal(calls[2].authorization, 'Bearer i1.fresh-key');
});
