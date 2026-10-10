import test from 'node:test';
import assert from 'node:assert/strict';
import type { Claim } from '../utils/business.ts';
import { memoryStore, storeFromEnv, supabaseStore } from './store.ts';

const claim = (id: string, extra: Partial<Claim> = {}): Claim => ({
  id,
  kind: 'claim',
  status: 'pending',
  placeId: 'apteka:2086',
  businessName: 'Монос 12 эмийн сан',
  category: null,
  serviceStyle: null,
  phones: ['99112233'],
  hours: 'Да-Ба 09:00-19:00',
  addressNote: '3-р хороолол',
  serviceAreas: ['БЗД'],
  ownerName: 'Б. Ганбат',
  contactPhone: '88112233',
  isOwner: true,
  note: '',
  createdAt: '2026-10-09T06:00:00.000Z',
  ...extra,
});

test('The memory store counts per business, month and kind, and keeps each month apart', async () => {
  const store = memoryStore();
  assert.deepEqual(await store.counts('p1', '2026-10'), {});
  await store.addEvent('p1', '2026-10', 'view');
  await store.addEvent('p1', '2026-10', 'view');
  await store.addEvent('p1', '2026-10', 'call');
  assert.deepEqual(await store.counts('p1', '2026-10'), { view: 2, call: 1 });
  // Another month and another business are other rows.
  assert.deepEqual(await store.counts('p1', '2026-09'), {});
  assert.deepEqual(await store.counts('p2', '2026-10'), {});
});

test('Claims come back as they were stored, newest first, filtered by kind and status', async () => {
  const store = memoryStore();
  assert.equal(await store.getClaim('cl_1'), null);
  await store.saveClaim(claim('cl_1', { createdAt: '2026-10-01T00:00:00.000Z' }));
  await store.saveClaim(claim('cl_2', { createdAt: '2026-10-02T00:00:00.000Z' }));
  await store.saveClaim(claim('pt_1', { kind: 'partner', createdAt: '2026-10-03T00:00:00.000Z' }));
  assert.deepEqual(await store.getClaim('cl_1'), claim('cl_1', { createdAt: '2026-10-01T00:00:00.000Z' }));
  assert.deepEqual((await store.listClaims({ limit: 10 })).map((c) => c.id), ['pt_1', 'cl_2', 'cl_1']);
  assert.deepEqual((await store.listClaims({ kind: 'claim', limit: 10 })).map((c) => c.id), ['cl_2', 'cl_1']);
  assert.deepEqual((await store.listClaims({ limit: 2 })).map((c) => c.id), ['pt_1', 'cl_2']);
  // Marking one writes it back under the same id; the status filter then finds it.
  await store.saveClaim({ ...claim('cl_1', { createdAt: '2026-10-01T00:00:00.000Z' }), status: 'approved' });
  assert.deepEqual((await store.listClaims({ status: 'approved', limit: 10 })).map((c) => c.id), ['cl_1']);
  assert.equal((await store.listClaims({ limit: 10 })).length, 3);
  // A copy goes in, so a later change to the object the caller kept never reaches the store.
  const draft = claim('cl_3');
  await store.saveClaim(draft);
  draft.status = 'rejected';
  assert.equal((await store.getClaim('cl_3'))?.status, 'pending');
});

test('A rate-limit step counts inside its own window, and the window ends on its own', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
  const store = memoryStore();
  assert.equal(await store.bump('rl:ev:abc', 120), 1);
  assert.equal(await store.bump('rl:ev:abc', 120), 2);
  // Another caller has their own allowance.
  assert.equal(await store.bump('rl:ev:other', 120), 1);
  t.mock.timers.tick(119_000);
  assert.equal(await store.bump('rl:ev:abc', 120), 3);
  t.mock.timers.tick(2_000);
  assert.equal(await store.bump('rl:ev:abc', 120), 1);
});

test('In production without the Supabase variables there is no store; dev and tests get one in memory', () => {
  assert.equal(storeFromEnv({ NODE_ENV: 'production' }), null);
  assert.ok(storeFromEnv({}));
  assert.ok(storeFromEnv({ NODE_ENV: 'production', SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key' }));
});

test('The Supabase adapter speaks PostgREST: the two functions for counting, plain rows for the claims', async () => {
  const calls: { url: string; method: string; body: unknown; headers: Record<string, string> }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null, headers });
    const path = String(url);
    if (path.includes('/rpc/bump_rate_limit')) return new Response('7');
    if (path.includes('/rpc/add_place_event')) return new Response('');
    if (path.includes('/place_counts')) return new Response(JSON.stringify([{ kind: 'view', n: 312 }, { kind: 'call', n: 14 }]));
    if (path.includes('/claims?select=*&id=eq.')) return new Response(JSON.stringify([{ id: 'cl_1', kind: 'claim', status: 'approved', place_id: 'apteka:2086', business_name: 'Монос 12', category: null, phones: ['99112233'], hours: '', address_note: '', service_areas: ['БЗД'], owner_name: 'Б. Ганбат', contact_phone: '88112233', is_owner: true, note: '', created_at: '2026-10-09T06:00:00+00:00' }]));
    return new Response(JSON.stringify([]));
  }) as typeof fetch;
  try {
    const store = supabaseStore('https://abc.supabase.co/', 'service-key');
    await store.addEvent('apteka:2086', '2026-10', 'view');
    assert.deepEqual(calls[0].body, { p_place_id: 'apteka:2086', p_month: '2026-10', p_kind: 'view' });
    // The service key goes in both headers PostgREST wants, and nowhere else.
    assert.equal(calls[0].headers.apikey, 'service-key');
    assert.equal(calls[0].headers.Authorization, 'Bearer service-key');

    assert.deepEqual(await store.counts('apteka:2086', '2026-10'), { view: 312, call: 14 });
    assert.match(calls[1].url, /\/place_counts\?select=kind,n&place_id=eq\.apteka%3A2086&month=eq\.2026-10$/);

    // Snake_case in the table, the shape the pages send in the app.
    const stored = await store.getClaim('cl_1');
    assert.equal(stored?.businessName, 'Монос 12');
    assert.equal(stored?.isOwner, true);
    assert.deepEqual(stored?.serviceAreas, ['БЗД']);
    assert.equal(stored?.createdAt, '2026-10-09T06:00:00.000Z');
    assert.equal(await store.bump('rl:ev:abc', 120), 7);
    assert.deepEqual(calls.at(-1)?.body, { p_key: 'rl:ev:abc', p_window_seconds: 120 });

    await store.listClaims({ kind: 'claim', status: 'approved', limit: 200 });
    assert.match(calls.at(-1)!.url, /\/claims\?select=\*&order=created_at\.desc&limit=200&kind=eq\.claim&status=eq\.approved$/);
  } finally {
    globalThis.fetch = original;
  }
});

test('A database that is unreachable or complaining throws, so the routes can answer 503', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response('{"message":"permission denied"}', { status: 401 })) as typeof fetch;
  try {
    await assert.rejects(() => supabaseStore('https://abc.supabase.co', 'service-key').addEvent('p1', '2026-10', 'view'));
  } finally {
    globalThis.fetch = original;
  }
});
