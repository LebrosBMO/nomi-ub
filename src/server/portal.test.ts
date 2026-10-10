import test from 'node:test';
import assert from 'node:assert/strict';
import { monthInUB, previousMonth } from '../utils/counters.ts';
import { issueInstallKey } from './assistant.ts';
import { createPortal, readReportLink, signReportLink, type Catalog, type PortalConfig } from './portal.ts';
import { memoryStore, type Store } from './store.ts';

const SECRET = 'test-only-signing-secret-0123456789abcdef';
const ADMIN = 'test-only-admin-token-123456';
const catalog: Catalog = { has: (id) => id === 'p1' || id === 'p2', name: (id) => (id === 'p1' ? 'Монос 12 эмийн сан' : null) };
const config = (extra: Partial<PortalConfig> = {}): PortalConfig => ({ accessToken: '', signingSecret: SECRET, adminToken: ADMIN, allowedOrigins: [], store: memoryStore(), catalog, ...extra });

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://nomi-ub.expo.app/api/' + path, { method: 'POST', headers: { host: 'nomi-ub.expo.app', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const get = (path: string, headers: Record<string, string> = {}) => new Request('https://nomi-ub.expo.app/api/' + path, { headers: { host: 'nomi-ub.expo.app', ...headers } });
const bearer = (token: string) => ({ authorization: 'Bearer ' + token });
/** A correction as the owner page sends it. */
const claimBody = (extra: Record<string, unknown> = {}) => ({
  placeId: 'p1',
  phones: ['99112233'],
  hours: 'Да-Ба 09:00-19:00',
  addressNote: '3-р хороолол, Их дэлгүүрийн баруун талд',
  serviceAreas: ['БЗД'],
  ownerName: 'Б. Ганбат',
  contactPhone: '88112233',
  isOwner: true,
  ...extra,
});

test('A count needs the same key as the assistant, a known place and a known kind', async () => {
  const handle = createPortal(config());
  const key = await issueInstallKey(SECRET);
  assert.equal((await handle('events', post('events', { placeId: 'p1', kind: 'view' }), 'a')).status, 401);
  const tampered = key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A');
  assert.equal((await handle('events', post('events', { placeId: 'p1', kind: 'view' }, bearer(tampered)), 'a')).status, 401);
  assert.equal((await handle('events', post('events', { placeId: 'p1', kind: 'view' }, bearer(key)), 'a')).status, 200);
  // A server paired by hand in Settings passes with its own token.
  const paired = createPortal(config({ accessToken: 'test-only-hosted-app-key-123456' }));
  assert.equal((await paired('events', post('events', { placeId: 'p1', kind: 'call' }, bearer('test-only-hosted-app-key-123456')), 'a')).status, 200);
  const refused = async (body: unknown) => {
    const response = await handle('events', post('events', body, bearer(key)), 'a');
    return [response.status, (await response.json()).error];
  };
  assert.deepEqual(await refused({ placeId: 'not-in-the-catalog', kind: 'view' }), [400, 'unknown_place']);
  assert.deepEqual(await refused({ kind: 'view' }), [400, 'unknown_place']);
  assert.deepEqual(await refused({ placeId: 'p1', kind: 'order' }), [400, 'invalid_kind']);
  assert.deepEqual(await refused({ placeId: 'p1' }), [400, 'invalid_kind']);
  assert.equal((await handle('events', get('events', bearer(key)), 'a')).status, 404);
});

test("The counts land in this month's row for that business, and nothing stored names the install", async () => {
  const store = memoryStore();
  const handle = createPortal(config({ store }));
  const key = await issueInstallKey(SECRET);
  const id = key.split('.')[1];
  for (const kind of ['view', 'view', 'call', 'share']) await handle('events', post('events', { placeId: 'p1', kind }, bearer(key)), 'a');
  await handle('events', post('events', { placeId: 'p2', kind: 'view' }, bearer(key)), 'a');
  assert.deepEqual(await store.counts('p1', monthInUB()), { view: 2, call: 1, share: 1 });
  assert.deepEqual(await store.counts('p2', monthInUB()), { view: 1 });
  assert.deepEqual(await store.counts('p1', previousMonth(monthInUB())), {});
  // A count knows the business, the month and the kind. The install id is not stored anywhere, not even in the rate limit,
  // which counts a digest of it (privacy).
  assert.ok(!JSON.stringify(store.claims()).includes(id));
  assert.ok(id.length > 10);
});

test('About 120 counts a minute per install; another install has its own allowance', async () => {
  const handle = createPortal(config());
  const key = await issueInstallKey(SECRET),other = await issueInstallKey(SECRET);
  const codes: number[] = [];
  for (let i = 0; i < 122; i++) codes.push((await handle('events', post('events', { placeId: 'p1', kind: 'view' }, bearer(key)), 'a')).status);
  assert.equal(codes.filter((c) => c === 200).length, 120);
  assert.deepEqual(codes.slice(-2), [429, 429]);
  assert.equal((await handle('events', post('events', { placeId: 'p1', kind: 'view' }, bearer(other)), 'a')).status, 200);
});

test('A claim is stored pending with an id and a time, and the owner checkbox, the phone and the lengths are checked', async () => {
  const store = memoryStore();
  const handle = createPortal(config({ store }));
  const sent = async (body: unknown, route: 'claim' | 'partner' = 'claim') => {
    const response = await handle(route, post('business/' + route, body), '203.0.113.7');
    return { status: response.status, body: await response.json() };
  };
  const first = await sent(claimBody());
  assert.equal(first.status, 200);
  assert.match(first.body.id, /^cl_/);
  assert.equal(first.body.status, 'pending');
  const stored = await store.getClaim(first.body.id);
  assert.equal(stored?.status, 'pending');
  assert.equal(stored?.contactPhone, '88112233');
  assert.deepEqual(stored?.serviceAreas, ['БЗД']);
  assert.ok(Number.isFinite(Date.parse(stored?.createdAt ?? '')));
  assert.deepEqual((await store.listClaims({ kind: 'claim', limit: 10 })).map((c) => c.id), [first.body.id]);

  const refused = async (body: unknown, route: 'claim' | 'partner' = 'claim') => {
    const answer = await sent(body, route);
    return [answer.status, answer.body.error];
  };
  assert.deepEqual(await refused(claimBody({ isOwner: false })), [400, 'not_owner']);
  assert.deepEqual(await refused(claimBody({ contactPhone: '1234' })), [400, 'invalid_phone']);
  assert.deepEqual(await refused(claimBody({ phones: ['99112233', '1234'] })), [400, 'invalid_phone']);
  assert.deepEqual(await refused(claimBody({ ownerName: '' })), [400, 'missing_contact']);
  assert.deepEqual(await refused(claimBody({ placeId: 'not-in-the-catalog' })), [400, 'unknown_place']);
  assert.deepEqual(await refused(claimBody({ placeId: null })), [400, 'missing_business']);
  assert.deepEqual(await refused(claimBody({ placeId: null, businessName: 'Шинэ дугуй засвар' })), [400, 'invalid_category']);
  assert.deepEqual(await refused(claimBody({ serviceAreas: ['Улаанбаатар'] })), [400, 'invalid_district']);
  assert.deepEqual(await refused(claimBody({ addressNote: 'х'.repeat(241) })), [400, 'too_long']);
  // The "add my business" path needs a name and a category from the registry, and then it is taken without a place id.
  const added = await sent(claimBody({ placeId: null, businessName: 'Шинэ дугуй засвар', category: 'tire' }));
  assert.equal(added.status, 200);
  // A partner request is always about a listed business, and the owner checkbox is not asked for.
  assert.equal((await sent(claimBody({ phones: [], hours: '', addressNote: '', serviceAreas: [], isOwner: false }), 'partner')).status, 200);
  assert.deepEqual(await refused(claimBody({ placeId: null }), 'partner'), [400, 'unknown_place']);
  assert.equal((await store.listClaims({ kind: 'partner', limit: 10 })).length, 1);
});

test('Claims are capped per address, and only a claim that passed every check counts against the cap', async () => {
  const handle = createPortal(config());
  const send = (body: unknown, address: string) => handle('claim', post('business/claim', body), address);
  // Twenty refused forms cost nothing.
  for (let i = 0; i < 20; i++) assert.equal((await send(claimBody({ contactPhone: 'x' }), '203.0.113.7')).status, 400);
  const codes: number[] = [];
  for (let i = 0; i < 6; i++) codes.push((await send(claimBody(), '203.0.113.7')).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
  assert.equal((await send(claimBody(), '198.51.100.4')).status, 200);
});

test('A report link is signed with the secret, and a tampered, unreadable or expired one is refused', async () => {
  const expires = Date.now() + 86_400_000;
  const token = await signReportLink(SECRET, 'p1', expires);
  assert.equal(await readReportLink(token, SECRET), 'p1');
  // A place id with a colon or a slash comes back whole.
  assert.equal(await readReportLink(await signReportLink(SECRET, 'osm:node/42', expires), SECRET), 'osm:node/42');
  assert.equal(await readReportLink(token, SECRET, expires + 1), null);
  assert.equal(await readReportLink(token, SECRET.replace('0', '1')), null);
  assert.equal(await readReportLink(token, 'too-short-secret'), null);
  assert.equal(await readReportLink(token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'), SECRET), null);
  assert.equal(await readReportLink('r1.bm90aGluZw.' + token.split('.')[2], SECRET), null);
  assert.equal(await readReportLink('', SECRET), null);
});

test('The report answers this month and last month for the business its link names, and says so plainly when the link is bad', async () => {
  const store = memoryStore();
  const handle = createPortal(config({ store }));
  const month = monthInUB(),last = previousMonth(month);
  for (let i = 0; i < 312; i++) await store.addEvent('p1', month, 'view');
  for (let i = 0; i < 14; i++) await store.addEvent('p1', month, 'call');
  for (let i = 0; i < 9; i++) await store.addEvent('p1', last, 'call');
  const token = await signReportLink(SECRET, 'p1', Date.now() + 86_400_000);
  const response = await handle('report', get('business/report?k=' + encodeURIComponent(token)), 'a');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.name, 'Монос 12 эмийн сан');
  assert.equal(body.month, month);
  assert.equal(body.previousMonth, last);
  assert.deepEqual(body.counts, { view: 312, open: 0, call: 14, map: 0, share: 0 });
  assert.deepEqual(body.previousCounts, { view: 0, open: 0, call: 9, map: 0, share: 0 });
  const expired = await signReportLink(SECRET, 'p1', Date.now() - 1000);
  assert.equal((await handle('report', get('business/report?k=' + encodeURIComponent(expired)), 'a')).status, 404);
  assert.equal((await handle('report', get('business/report'), 'a')).status, 404);
});

test("/admin needs the founder's token, then lists the claims newest first, marks them and makes report links", async () => {
  const store = memoryStore();
  const handle = createPortal(config({ store }));
  await handle('claim', post('business/claim', claimBody()), '203.0.113.7');
  await handle('partner', post('business/partner', claimBody({ isOwner: false })), '203.0.113.7');

  assert.equal((await handle('admin-claims', get('admin/claims'), 'a')).status, 401);
  assert.equal((await handle('admin-claims', get('admin/claims', bearer('wrong-token-but-right-length')), 'a')).status, 401);
  assert.equal((await handle('admin-report-link', get('admin/report-link?placeId=p1'), 'a')).status, 401);
  // A deployment without NOMI_ADMIN_TOKEN says so instead of letting anyone in.
  const off = createPortal(config({ adminToken: '' }));
  assert.equal((await off('admin-claims', get('admin/claims', bearer('')), 'a')).status, 503);
  assert.equal((await off('admin-claims', get('admin/claims', bearer(ADMIN)), 'a')).status, 503);

  const listed = await handle('admin-claims', get('admin/claims', bearer(ADMIN)), 'a');
  assert.equal(listed.status, 200);
  const { items } = await listed.json();
  assert.equal(items.length, 2);
  assert.ok(items[0].createdAt >= items[1].createdAt);
  assert.deepEqual(items.map((c: { kind: string }) => c.kind).sort(), ['claim', 'partner']);

  const claim = items.find((c: { kind: string }) => c.kind === 'claim');
  const marked = await handle('admin-claims', post('admin/claims', { id: claim.id, status: 'approved' }, bearer(ADMIN)), 'a');
  assert.equal(marked.status, 200);
  assert.equal((await marked.json()).claim.status, 'approved');
  const approved = await handle('admin-claims', get('admin/claims?status=approved&kind=claim', bearer(ADMIN)), 'a');
  assert.deepEqual((await approved.json()).items.map((c: { id: string }) => c.id), [claim.id]);
  assert.equal((await handle('admin-claims', post('admin/claims', { id: claim.id, status: 'nonsense' }, bearer(ADMIN)), 'a')).status, 400);
  assert.equal((await handle('admin-claims', post('admin/claims', { id: 'cl_nothing', status: 'called' }, bearer(ADMIN)), 'a')).status, 404);
  assert.equal((await handle('admin-claims', get('admin/claims?status=nonsense', bearer(ADMIN)), 'a')).status, 400);

  const link = await handle('admin-report-link', get('admin/report-link?placeId=p1', bearer(ADMIN)), 'a');
  assert.equal(link.status, 200);
  const body = await link.json();
  assert.match(body.link, /^https:\/\/nomi-ub\.expo\.app\/business\/report\?k=r1\./);
  assert.equal(await readReportLink(new URL(body.link).searchParams.get('k') ?? '', SECRET), 'p1');
  assert.equal((await handle('admin-report-link', get('admin/report-link?placeId=nope', bearer(ADMIN)), 'a')).status, 400);
});

test('Guessing the admin token is capped per address, and the right token never counts against it', async () => {
  const handle = createPortal(config());
  const guess = (n: number) => handle('admin-claims', get('admin/claims', bearer('wrong-token-number-' + n)), '203.0.113.9');
  const codes: number[] = [];
  for (let i = 0; i < 12; i++) codes.push((await guess(i)).status);
  // Ten wrong tokens an hour, then the address is turned away without even a comparison.
  assert.equal(codes.filter((c) => c === 401).length, 10);
  assert.deepEqual(codes.slice(-2), [429, 429]);
  // Another address still has its own allowance, and a right token is never counted, however often it is used.
  assert.equal((await handle('admin-claims', get('admin/claims', bearer('wrong')), '198.51.100.9')).status, 401);
  for (let i = 0; i < 30; i++) assert.equal((await handle('admin-claims', get('admin/claims', bearer(ADMIN)), '198.51.100.9')).status, 200);
  assert.equal((await handle('admin-report-link', get('admin/report-link?placeId=p1', bearer(ADMIN)), '198.51.100.9')).status, 200);
});

test('Without a store, and with one that fails, every route answers 503 instead of breaking', async () => {
  const key = await issueInstallKey(SECRET);
  const none = createPortal(config({ store: null }));
  const token = await signReportLink(SECRET, 'p1', Date.now() + 86_400_000);
  for (const [status, response] of [
    ['events', await none('events', post('events', { placeId: 'p1', kind: 'view' }, bearer(key)), 'a')],
    ['claim', await none('claim', post('business/claim', claimBody()), 'a')],
    ['report', await none('report', get('business/report?k=' + encodeURIComponent(token)), 'a')],
    ['admin', await none('admin-claims', get('admin/claims', bearer(ADMIN)), 'a')],
  ] as [string, Response][]) {
    assert.equal(response.status, 503, status);
    assert.equal((await response.json()).error, 'store_not_configured', status);
  }
  const broken = { ...memoryStore(), addEvent: async () => Promise.reject(new Error('supabase down')) } as unknown as Store;
  const failing = createPortal(config({ store: broken }));
  const response = await failing('events', post('events', { placeId: 'p1', kind: 'view' }, bearer(key)), 'a');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'store_unavailable');
});

test('Another site cannot call the owner routes from a browser, and the hosting own origin can', async () => {
  const handle = createPortal(config());
  const from = (origin: string) => handle('claim', post('business/claim', claimBody(), { origin }), 'a');
  assert.equal((await from('https://evil.example')).status, 403);
  assert.equal((await from('https://nomi-ub.expo.app')).status, 200);
  assert.equal((await from('https://nomi-ub--ckn34llwqb.expo.app')).status, 200);
  const options = await handle('claim', new Request('https://nomi-ub.expo.app/api/business/claim', { method: 'OPTIONS', headers: { host: 'nomi-ub.expo.app', origin: 'https://nomi-ub.expo.app' } }), 'a');
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('access-control-allow-origin'), 'https://nomi-ub.expo.app');
});
