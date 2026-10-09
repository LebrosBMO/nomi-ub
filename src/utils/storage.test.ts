import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyPersonal } from './personal.ts';
import { attachNotification, cancelAllReminders, emptyReminders, handleReminders, restoreReminders, type NotificationAdapter } from './reminders.ts';
import {
  AI_DISCLOSURE,
  AI_PROVIDER,
  aiStatus,
  deleteAllData,
  NOMI_KEYS,
  PILOT_KEY,
  readState,
  settingsStore,
  TOKEN_KEY,
  INSTALL_KEY,
  TOKEN_MAX,
  validToken,
  withConsent,
  withPairing,
  type KeyValueStore,
  type SecureStore,
} from './storage.ts';

const TOKEN = 'p'.repeat(32);
const SERVER = 'http://192.168.1.65:8787';

/** AsyncStorage as a Map. Keys in `failing` refuse every write and removal. */
function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const failing = new Set<string>();
  const store: KeyValueStore = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      if (failing.has(key)) throw new Error('disk');
      data.set(key, value);
    },
    removeItem: async (key) => {
      if (failing.has(key)) throw new Error('disk');
      data.delete(key);
    },
    getAllKeys: async () => [...data.keys()],
  };
  return { store, data, failing };
}

/** SecureStore as a Map that counts its writes; `broken` makes every call throw. */
function secureStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const calls = { set: 0, delete: 0 };
  const state = { broken: false };
  const check = () => {
    if (state.broken) throw new Error('keychain');
  };
  const store: SecureStore = {
    getItem: async (key) => {
      check();
      return data.get(key) ?? null;
    },
    setItem: async (key, value) => {
      check();
      calls.set++;
      data.set(key, value);
    },
    deleteItem: async (key) => {
      check();
      calls.delete++;
      data.delete(key);
    },
  };
  return { store, data, calls, state };
}

const pilot = (fields: Record<string, unknown>) => JSON.stringify({ saved: [], visits: {}, apiUrl: SERVER, token: TOKEN, ...fields });

test('AC 8.1: the first load moves a token left in AsyncStorage into SecureStore and blanks the AsyncStorage copy', async () => {
  const local = memoryStore({ [PILOT_KEY]: pilot({ onboardedAt: '2026-09-18T01:00:00.000Z' }) });
  const secure = secureStore();
  const state = await settingsStore(local.store, secure.store).load();
  assert.equal(state.token, TOKEN);
  assert.equal(state.apiUrl, SERVER);
  assert.equal(secure.data.get(TOKEN_KEY), TOKEN);
  const saved = JSON.parse(local.data.get(PILOT_KEY)!);
  assert.equal(saved.token, '');
  assert.equal(saved.apiUrl, SERVER);
  assert.equal(saved.onboardedAt, '2026-09-18T01:00:00.000Z');
  // Every later launch reads the token from SecureStore; nothing is moved or written again.
  const again = await settingsStore(local.store, secure.store).load();
  assert.equal(again.token, TOKEN);
  assert.equal(secure.calls.set, 1);
});

test('A save keeps the token in SecureStore only, rewrites it only when it changed, and unpairing deletes it', async () => {
  const local = memoryStore();
  const secure = secureStore();
  const settings = settingsStore(local.store, secure.store);
  const state = await settings.load();
  assert.equal(state.token, '');
  const paired = withPairing(state, SERVER, TOKEN);
  await settings.save(paired);
  assert.equal(secure.data.get(TOKEN_KEY), TOKEN);
  assert.equal(JSON.parse(local.data.get(PILOT_KEY)!).token, '');
  // A save that does not touch the token (the location answer, the consent) leaves SecureStore alone.
  await settings.save({ ...paired, locationAsked: true });
  await settings.save(withConsent(paired));
  assert.equal(secure.calls.set, 1);
  await settings.save({ ...paired, token: 'q'.repeat(30) });
  assert.equal(secure.data.get(TOKEN_KEY), 'q'.repeat(30));
  await settings.save(withPairing(paired, '', ''));
  assert.equal(secure.data.has(TOKEN_KEY), false);
  assert.equal(secure.calls.delete, 1);
  // A token in the keychain without a server (an earlier iOS install, say) pairs nothing.
  const orphan = await settingsStore(memoryStore().store, secureStore({ [TOKEN_KEY]: TOKEN }).store).load();
  assert.equal(orphan.token, '');
});

test('A failed SecureStore write keeps the token where it was: the move is retried and a save reports the failure', async () => {
  const local = memoryStore({ [PILOT_KEY]: pilot({}) });
  const secure = secureStore();
  secure.state.broken = true;
  const settings = settingsStore(local.store, secure.store);
  const state = await settings.load();
  assert.equal(state.token, TOKEN, 'the app stays paired');
  assert.equal(JSON.parse(local.data.get(PILOT_KEY)!).token, TOKEN, 'nothing blanked before the secure copy exists');
  await assert.rejects(settings.save({ ...state, token: 'r'.repeat(30) }));
  assert.equal(JSON.parse(local.data.get(PILOT_KEY)!).token, TOKEN, 'a failed save changes nothing');
  secure.state.broken = false;
  await settingsStore(local.store, secure.store).load();
  assert.equal(secure.data.get(TOKEN_KEY), TOKEN);
  assert.equal(JSON.parse(local.data.get(PILOT_KEY)!).token, '');
});

test('Web: without SecureStore the token stays in browser storage', async () => {
  const local = memoryStore({ [PILOT_KEY]: pilot({}) });
  const settings = settingsStore(local.store, null);
  const state = await settings.load();
  assert.equal(state.token, TOKEN);
  assert.equal(JSON.parse(local.data.get(PILOT_KEY)!).token, TOKEN);
  await settings.save({ ...state, token: 's'.repeat(30) });
  assert.equal(JSON.parse(local.data.get(PILOT_KEY)!).token, 's'.repeat(30));
});

test('Consent: clearing the server URL withdraws it, and only an agreed state reaches the AI', () => {
  const paired = withPairing({ ...readState(null) }, SERVER, TOKEN);
  // A fresh install has Nomi's hosted server (hosted.ts), so it starts at 'consent': nothing is sent before the agreement.
  assert.equal(aiStatus(readState(null)), 'consent');
  assert.equal(aiStatus(paired), 'consent');
  const agreed = withConsent(paired, new Date('2026-09-18T10:00:00Z'));
  assert.equal(agreed.aiConsentAt, '2026-09-18T10:00:00.000Z');
  assert.equal(aiStatus(agreed), 'on');
  // Changing the server keeps the consent; clearing it withdraws the consent and the token.
  assert.equal(withPairing(agreed, 'https://nomi.example', TOKEN).aiConsentAt, agreed.aiConsentAt);
  const cleared = withPairing(agreed, '', '');
  assert.equal('aiConsentAt' in cleared, false);
  assert.equal(cleared.token, '');
  assert.equal(aiStatus(cleared), 'consent');
  // An agreed state without a paired token falls back to the hosted server.
  assert.equal(aiStatus({ ...agreed, token: '' }), 'on');
  // The stored consent survives a round trip; a malformed one is dropped.
  assert.equal(readState(JSON.stringify(agreed)).aiConsentAt, agreed.aiConsentAt);
  assert.equal('aiConsentAt' in readState(pilot({ aiConsentAt: 'yesterday' })), false);
  assert.equal('aiConsentAt' in readState(pilot({ aiConsentAt: 5 })), false);
});

test('Consent names the provider: consent to an earlier provider asks again, and unpairing drops the provider too', () => {
  const paired = withPairing({ ...readState(null) }, SERVER, TOKEN);
  const agreed = withConsent(paired);
  assert.equal(agreed.aiConsentFor, AI_PROVIDER);
  assert.match(AI_DISCLOSURE, /OpenAI/);
  // A store written when the disclosure named Google Gemini has aiConsentAt and no provider.
  const earlier = readState(pilot({ apiUrl: SERVER, token: TOKEN, aiConsentAt: '2026-09-18T01:00:00.000Z' }));
  assert.equal(aiStatus(earlier), 'consent');
  assert.equal(aiStatus({ ...agreed, aiConsentFor: 'gemini' }), 'consent');
  assert.equal(aiStatus(readState(JSON.stringify(agreed))), 'on');
  assert.equal('aiConsentFor' in withPairing(agreed, '', ''), false);
  assert.equal('aiConsentFor' in readState(pilot({ aiConsentFor: 7 })), false);
});

test('The pairing token is 24 to 512 characters without spaces, so the SecureStore value stays small', () => {
  assert.equal(validToken('x'.repeat(23)), false);
  assert.equal(validToken('x'.repeat(24)), true);
  assert.equal(validToken('x'.repeat(TOKEN_MAX)), true);
  assert.equal(validToken('x'.repeat(TOKEN_MAX + 1)), false);
  assert.equal(validToken('x'.repeat(12) + ' ' + 'x'.repeat(12)), false);
});

const now = new Date('2026-09-18T02:00:00Z');
/** A phone with three reminders, two of them scheduled, and every store the app writes. */
function fullDevice() {
  let reminders = emptyReminders();
  for (const text of ['Сануул: маргааш 10:00 нэг', 'Сануул: маргааш 11:00 хоёр', 'Сануул: маргааш 12:00 гурав']) {
    reminders = handleReminders(text, reminders, emptyPersonal(), now)!.store;
  }
  reminders = attachNotification(attachNotification(reminders, '1', 'n-1'), '3', 'n-3');
  const local = memoryStore({
    'nomi:chat:v1': '[{"id":"1","role":"user","text":"бзд эмийн сан"}]',
    [PILOT_KEY]: pilot({ aiConsentAt: '2026-09-18T01:00:00.000Z' }),
    'nomi:personal:v1': '{"version":1,"nextId":3,"tasks":[],"memories":[]}',
    'nomi:reminders:v1': JSON.stringify(reminders),
    'nomi:reports:v1': '{"version":1,"items":[]}',
    'nomi:activity:v1': '{"version":1,"items":[]}',
    'nomi:usage:v1': '{"day":"2026-09-18","messages":3}',
    'nomi:followups:v1': '{"version":1,"items":[]}',
    'nomi:future:v2': '{}',
    'other-app:key': 'kept',
  });
  const secure = secureStore({ [TOKEN_KEY]: TOKEN, [INSTALL_KEY]: 'i1.install-key' });
  const calls = { cancel: [] as string[], cancelAll: 0 };
  const notifications: NotificationAdapter = {
    supported: true,
    granted: async () => true,
    request: async () => true,
    schedule: async (r) => 'n-' + r.id,
    cancel: async (id) => {
      calls.cancel.push(id);
    },
    cancelAll: async () => {
      calls.cancelAll++;
    },
  };
  const order: string[] = [];
  const deps = {
    local: local.store,
    secure: secure.store,
    // The same steps as deleteReminders() in reminders-storage.ts, against the fakes.
    deleteReminders: async () => {
      order.push('reminders');
      const raw = await local.store.getItem('nomi:reminders:v1');
      await cancelAllReminders(raw ? restoreReminders(JSON.parse(raw)) : emptyReminders(), notifications);
      await local.store.removeItem('nomi:reminders:v1');
    },
    deleteFollowups: async () => {
      order.push('followups');
      await local.store.removeItem('nomi:followups:v1');
    },
  };
  return { local, secure, calls, order, deps };
}

test('AC 8.3: "delete my data" cancels every notification, removes the secure token and every nomi: key, and keeps other apps\' keys', async () => {
  const device = fullDevice();
  await deleteAllData(device.deps);
  assert.deepEqual(device.calls.cancel, ['n-1', 'n-3']);
  assert.equal(device.calls.cancelAll, 1);
  assert.deepEqual(device.order, ['reminders', 'followups'], 'notifications go first, while the reminder store still names them');
  assert.equal(device.secure.data.has(TOKEN_KEY), false);
  assert.equal(device.secure.data.has(INSTALL_KEY), false, 'the install key for the hosted server goes too');
  for (const key of NOMI_KEYS) assert.equal(device.local.data.has(key), false, key);
  assert.equal(device.local.data.has('nomi:future:v2'), false, 'an unlisted nomi: key goes too');
  assert.deepEqual([...device.local.data.keys()], ['other-app:key']);
  // Nothing left means a fresh start: the settings read back empty and unpaired.
  const state = await settingsStore(device.local.store, device.secure.store).load();
  assert.deepEqual(state, readState(null));
});

test('A step that fails does not stop the others, and the deletion reports it so the user can try again', async () => {
  const device = fullDevice();
  device.local.failing.add('nomi:personal:v1');
  device.secure.state.broken = true;
  await assert.rejects(deleteAllData(device.deps), /delete_incomplete/);
  assert.equal(device.calls.cancelAll, 1);
  assert.deepEqual([...device.local.data.keys()].sort(), ['nomi:personal:v1', 'other-app:key']);
  device.local.failing.clear();
  device.secure.state.broken = false;
  await deleteAllData(device.deps);
  assert.deepEqual([...device.local.data.keys()], ['other-app:key']);
  assert.equal(device.secure.data.size, 0);
  // Web: no secure store, and the token went with nomi:pilot:v1.
  const web = fullDevice();
  await deleteAllData({ ...web.deps, secure: null });
  assert.deepEqual([...web.local.data.keys()], ['other-app:key']);
});

test('NOMI_KEYS names every AsyncStorage key the app source uses', () => {
  const src = fileURLToPath(new URL('..', import.meta.url));
  const found = new Set<string>();
  for (const file of fs.readdirSync(src, { recursive: true }) as string[]) {
    if (!/\.tsx?$/.test(file) || file.endsWith('.test.ts')) continue;
    for (const match of fs.readFileSync(path.join(src, file), 'utf8').matchAll(/nomi:[a-z]+:v\d+/g)) found.add(match[0]);
  }
  assert.ok(found.size >= 8, [...found].join(', '));
  for (const key of found) assert.ok((NOMI_KEYS as readonly string[]).includes(key), key);
});
