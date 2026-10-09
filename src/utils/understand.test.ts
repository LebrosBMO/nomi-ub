import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AssistantError, type AssistantReply } from './assistant-api.ts';
import { inCategory, openAtNight, type Intent, type Place } from './core.ts';
import {
  countLocated,
  knownLocationLine,
  LOCATED_STEP,
  LOCATING_STATUS,
  LOCATION_DENIED_LINE,
  LOCATION_FAILED_STEP,
  LOCATION_QUESTION,
  NOT_SORTED_LINE,
  type Coordinates,
} from './location.ts';
import { emptyBoxes } from './boxes.ts';
import { emptyPayments, type PaymentStore } from './payments.ts';
import { emptyPersonal, type PersonalState } from './personal.ts';
import {
  CANCELLED_STEP,
  emptyReminders,
  PAST_TIME_LINE,
  PERMISSION_DENIED_STEP,
  PERMISSION_GRANTED_STEP,
  REMINDER_DENIED_LINE,
  REMINDER_EXPLANATION,
  REMINDER_FAILED_LINE,
  REMINDER_SET_LINE,
  REMINDER_WEB_LINE,
  SCHEDULE_FAILED_STEP,
  SCHEDULED_STEP,
  type NotificationAdapter,
  type ReminderStore,
} from './reminders.ts';
import { HOSTED_API_URL } from './hosted.ts';
import { memoryInstallKeys } from './install.ts';
import { aiStatus, withConsent, withPairing, type LocalState } from './storage.ts';
import {
  assistantFor,
  CONSENT_LINE,
  NIGHT_LINE,
  DAILY_LIMIT_LINE,
  FALLBACK_LINE,
  FALLBACK_STEP,
  MESSAGE_LIMIT,
  understand,
  type Ask,
  type LocationAccess,
} from './understand.ts';

const places = JSON.parse(fs.readFileSync(new URL('../data/directory.json', import.meta.url), 'utf8')) as Place[];
const byId = new Map(places.map((p) => [p.id, p]));
const pharmacies = places.filter((p) => inCategory(p, 'pharmacy')).length;
const intent: Intent = { category: 'pharmacy', district: 'БЗД', query: 'бзд эмийн сан', nearby: false, openNow: false, action: 'search', clarification: null };
const nearby: Intent = { ...intent, district: null, query: 'ойрхон эмийн сан', nearby: true };
/** Sükhbaatar Square: the fixed test location. */
const SQUARE: Coordinates = { latitude: 47.9187, longitude: 106.9176 };
/** Location access that answers as told and counts what was asked of it. */
function fakeLocation(mode: LocationAccess['mode'], position: LocationAccess['position']) {
  const calls = { mode: 0, position: 0 };
  const access: LocationAccess = {
    mode: () => {
      calls.mode++;
      return mode();
    },
    position: () => {
      calls.position++;
      return position();
    },
  };
  return { access, calls };
}

/** A fake server that records its calls and answers however the test says. */
function fakeAsk(answer: () => Promise<AssistantReply>) {
  const calls: string[] = [];
  const ask: Ask = (message) => {
    calls.push(message);
    return answer();
  };
  return { ask, calls };
}
const failing = () => fakeAsk(() => Promise.reject(new TypeError('fetch failed')));

/** A phone whose notification calls are recorded; `standing` is the permission before any prompt, `allow` the prompt's answer. */
function fakeNotifications(standing: boolean, allow = true, supported = true) {
  const calls = { granted: 0, request: 0, schedule: [] as string[], cancel: [] as string[], cancelAll: 0 };
  let state = standing;
  const adapter: NotificationAdapter = {
    supported,
    granted: async () => {
      calls.granted++;
      return state;
    },
    request: async () => {
      calls.request++;
      state = allow;
      return state;
    },
    schedule: async (r) => {
      calls.schedule.push(r.id);
      return 'n-' + r.id;
    },
    cancel: async (id) => {
      calls.cancel.push(id);
    },
    cancelAll: async () => {
      calls.cancelAll++;
    },
  };
  return { adapter, calls };
}

async function run(
  text: string,
  extra: {
    ask?: Ask;
    askConsent?: boolean;
    previous?: Intent;
    personal?: PersonalState;
    payments?: PaymentStore;
    reminders?: ReminderStore;
    saveReminders?: (store: ReminderStore) => Promise<unknown>;
    notifications?: NotificationAdapter;
    onExplain?: (text: string) => void;
    reported?: ReadonlySet<string>;
    location?: LocationAccess;
    intent?: Intent;
    stepMs?: number;
    onStatus?: (s: string) => void;
  } = {}
) {
  const saved: PersonalState[] = [];
  const savedReminders: ReminderStore[] = [];
  const savedPayments: PaymentStore[] = [];
  const result = await understand(text, {
    places,
    personal: extra.personal ?? emptyPersonal(),
    savePersonal: async (state) => {
      saved.push(state);
    },
    reminders: extra.reminders ?? emptyReminders(),
    saveReminders: async (store) => {
      savedReminders.push(store);
    },
    payments: extra.payments ?? emptyPayments(),
    savePayments: async (store) => {
      savedPayments.push(store);
    },
    boxes: emptyBoxes(),
    saveBoxes: async () => {},
    stepMs: 0,
    ...extra,
  });
  return { ...result, saved, savedReminders, savedPayments };
}

test('AC 3.3: paired but unreachable server still answers "бзд эмийн сан" with pharmacy cards and the fallback line', async () => {
  const { ask, calls } = failing();
  const got = await run('бзд эмийн сан', { ask });
  assert.equal(calls.length, 1);
  assert.ok(got.places && got.places.length > 0 && got.places.length <= 3);
  for (const id of got.places) {
    const place = byId.get(id);
    assert.ok(place, 'AC 4.1: card id exists in directory.json');
    assert.ok(inCategory(place, 'pharmacy'), place.name);
    assert.equal(place.district, 'БЗД');
  }
  assert.ok(got.text.startsWith(FALLBACK_LINE + '\n\n'));
  assert.match(got.text, /БЗД-ээс эдгээр газрыг оллоо/);
  assert.deepEqual(got.steps, [FALLBACK_STEP, `${pharmacies} эмийн сангаас хайлаа`]);
  assert.equal(got.aiUsed, false);
  assert.equal(got.tokens, undefined);
  assert.equal(got.intent?.category, 'pharmacy');
});

test('AC 3.4: an intent with action "transfer" is rejected and falls back; the answer still counts as an AI request', async () => {
  const { ask } = fakeAsk(async () => ({ intent: { ...intent, action: 'transfer' }, tokens: { input: 300, output: 40, total: 340 } }));
  const got = await run('бзд эмийн сан', { ask });
  assert.ok(got.text.startsWith(FALLBACK_LINE));
  assert.ok(got.places && got.places.length > 0);
  assert.ok(!got.steps.includes('AI хүсэлтийг задаллаа'));
  assert.ok(got.steps.includes(FALLBACK_STEP));
  assert.equal(got.aiUsed, true);
  assert.equal(got.tokens?.total, 340);
  assert.equal(got.intent?.action, 'search');
});

test('Every AI failure falls back; only the daily cap gets its own line', async () => {
  const lines: [unknown, string][] = [
    [new AssistantError(429, 'daily_limit'), DAILY_LIMIT_LINE],
    [new AssistantError(429, ''), DAILY_LIMIT_LINE],
    [new AssistantError(429, 'rate_limit'), FALLBACK_LINE],
    [new AssistantError(503, 'ai_not_configured'), FALLBACK_LINE],
    [new AssistantError(401, 'pairing_required'), FALLBACK_LINE],
    [new DOMException('timed out', 'TimeoutError'), FALLBACK_LINE],
    [new SyntaxError('not json'), FALLBACK_LINE],
  ];
  for (const [error, line] of lines) {
    const got = await run('бзд эмийн сан', { ask: fakeAsk(() => Promise.reject(error)).ask });
    assert.ok(got.text.startsWith(line + '\n\n'), String(error));
    assert.equal(got.steps[0], FALLBACK_STEP);
    assert.equal(got.aiUsed, false);
  }
  const garbage = await run('бзд эмийн сан', { ask: fakeAsk(async () => ({ intent: 'nonsense' })).ask });
  assert.ok(garbage.text.startsWith(FALLBACK_LINE));
});

test('Fallback keeps the previous intent for follow-ups and reaches the clarification path too', async () => {
  const { ask } = failing();
  const followUp = await run('худ', { ask, previous: intent });
  assert.equal(followUp.intent?.category, 'pharmacy');
  assert.equal(followUp.intent?.district, 'ХУД');
  const vague = await run('юу ч', { ask });
  assert.equal(vague.intent?.action, 'clarify');
  assert.ok(vague.text.startsWith(FALLBACK_LINE + '\n\n'));
  assert.deepEqual(vague.places, []);
  assert.deepEqual(vague.steps, [FALLBACK_STEP]);
});

test('AC 11.5: personal commands never call the assistant, paired or not', async () => {
  const { ask, calls } = fakeAsk(async () => ({ intent }));
  const commands = ['Ажил нэм: дугуй засварууд руу залгах', 'Миний ажлууд', 'Санаж ав: миний машин Prius', 'Өнөөдрийн төлөвлөгөө', 'Тусламж', 'Маргааш хийх: дугуй засвар руу залгах'];
  let personal = emptyPersonal();
  for (const text of commands) {
    const got = await run(text, { ask, personal });
    assert.equal(calls.length, 0, text);
    assert.equal(got.aiUsed, false);
    assert.equal(got.places, undefined);
    assert.equal(got.intent, undefined);
    assert.equal(got.steps[0], 'Хүсэлтийг ойлголоо');
    personal = got.personal;
  }
  assert.equal(personal.tasks.length, 2);
  assert.equal(personal.memories.length, 1);
  const add = await run('Ажил нэм: шинэ', { ask, personal });
  assert.deepEqual(add.steps, ['Хүсэлтийг ойлголоо', 'Энэ утсанд хадгаллаа']);
  assert.equal(add.saved.length, 1);
  assert.equal(add.saved[0], add.personal);
  const list = await run('Миний ажлууд', { ask, personal: add.personal });
  assert.equal(list.saved.length, 0);
  assert.equal(list.personal, add.personal);
  assert.match(list.text, /шинэ/);
});

test('A valid AI intent drives the search and its step labels and tokens are kept', async () => {
  const status: string[] = [];
  const { ask, calls } = fakeAsk(async () => ({ intent, tokens: { input: 900, output: 120, total: 1020 }, daily: { used: 3, limit: 200 } }));
  const got = await run('өчигдөр хэлсэн шиг тэр эмийн сангуудыг бзд-ээс олоод өгөөч', { ask, onStatus: (s) => status.push(s) });
  assert.deepEqual(calls, ['өчигдөр хэлсэн шиг тэр эмийн сангуудыг бзд-ээс олоод өгөөч']);
  assert.deepEqual(got.steps, ['AI хүсэлтийг задаллаа', `${pharmacies} эмийн сангаас хайлаа`]);
  assert.deepEqual(status, ['Хүсэлтийг ойлгож байна', 'AI бодож байна', `${pharmacies} эмийн сангаас хайж байна`]);
  assert.equal(got.aiUsed, true);
  assert.deepEqual(got.tokens, { input: 900, output: 120, total: 1020 });
  assert.deepEqual(got.daily, { used: 3, limit: 200 });
  assert.ok(!got.text.includes(FALLBACK_LINE));
  assert.ok(got.places && got.places.length === 3);
  for (const id of got.places) assert.equal(byId.get(id)?.district, 'БЗД');
});

test('Unpaired: the offline parser answers directly, greetings get the fixed reply', async () => {
  const status: string[] = [];
  const got = await run('БЗД эмийн сан', { onStatus: (s) => status.push(s) });
  assert.deepEqual(got.steps, ['Хүсэлтийг ойлголоо', `${pharmacies} эмийн сангаас хайлаа`]);
  assert.deepEqual(status, ['Хүсэлтийг ойлгож байна', `${pharmacies} эмийн сангаас хайж байна`]);
  assert.ok(!got.text.includes(FALLBACK_LINE));
  const hello = await run('Сайн уу!');
  assert.match(hello.text, /^Сайн уу!/);
  assert.deepEqual(hello.steps, ['Хүсэлтийг ойлголоо']);
  assert.equal(hello.intent, undefined);
  assert.deepEqual(hello.places, []);
});

test('AC 4.5: for "БЗД эмийн сан" every result is a pharmacy in БЗД, and AC 4.1: every id is in the catalog', async () => {
  for (const text of ['БЗД эмийн сан', 'bzd emiin san', 'зайсанд дугуй засвар', 'худ будаг зардаг газар', 'налайх эмийн сан']) {
    const got = await run(text);
    assert.ok(got.places && got.places.length <= 3, text);
    for (const id of got.places) assert.ok(byId.has(id), `${text}: ${id}`);
  }
  const got = await run('БЗД эмийн сан');
  assert.ok(got.places && got.places.length > 0);
  for (const id of got.places) {
    assert.ok(inCategory(byId.get(id)!, 'pharmacy'), id);
    assert.equal(byId.get(id)?.district, 'БЗД');
  }
});

test('AC 10.1: every reply carries at least one step and an elapsed time, on every finish path; steps are paced', async () => {
  const { ask: answering } = fakeAsk(async () => ({ intent, tokens: { input: 10, output: 5, total: 15 } }));
  const replies = [
    await run('Тусламж'),
    await run('Ажил нэм: нэг'),
    await run('Сайн уу'),
    await run('БЗД эмийн сан'),
    await run('юу ч'),
    await run('кино тасалбар захиалаад өг'),
    await run('бзд эмийн сан', { ask: failing().ask }),
    await run('бзд эмийн сан', { ask: answering }),
    await run('бзд эмийн сан', { ask: fakeAsk(async () => ({ intent: 'nonsense' })).ask }),
  ];
  for (const got of replies) {
    assert.ok(got.steps.length >= 1, got.text);
    assert.ok(Number.isInteger(got.ms) && got.ms >= 0, got.text);
  }
  const paced = await run('БЗД эмийн сан', { stepMs: 40 });
  assert.ok(paced.ms >= 70, `two steps of 40 ms took ${paced.ms} ms`);
});

test('A personal command reports the store change by id only, and only once it is saved', async () => {
  const added = await run('Санаж ав: миний машин Prius');
  assert.deepEqual(added.action, { kind: 'memory_add', id: '1' });
  assert.equal(added.saved.length, 1);
  const task = await run('Ажил нэм: нэг', { personal: added.personal });
  assert.deepEqual(task.action, { kind: 'task_add', id: '2' });
  const finished = await run('Ажил 2 дууссан', { personal: task.personal });
  assert.deepEqual(finished.action, { kind: 'task_done', id: '2' });
  assert.deepEqual((await run('Ажил 2 устга', { personal: task.personal })).action, { kind: 'task_delete', id: '2' });
  assert.deepEqual((await run('Санамж 1 устга', { personal: task.personal })).action, { kind: 'memory_delete', id: '1' });
  assert.deepEqual((await run('Ажил 2 сэргээ', { personal: finished.personal })).action, { kind: 'task_restore', id: '2' });
  // A task already in the asked-for state is not saved again and leaves no activity entry; the reply says so.
  const again = await run('Ажил 2 дууссан', { personal: finished.personal });
  assert.equal(again.action, undefined);
  assert.equal(again.saved.length, 0);
  assert.match(again.text, /аль хэдийн дууссан/);
  assert.match((await run('Ажил 2 сэргээ', { personal: task.personal })).text, /дуусаагүй/);
  for (const text of ['Миний ажлууд', 'Ажил 9 устга', 'Ажил нэм: нэг', 'Тусламж', 'БЗД эмийн сан', 'Ажил 2 сэргээ']) {
    assert.equal((await run(text, { personal: task.personal })).action, undefined, text);
  }
  assert.ok(!JSON.stringify(added.action).includes('Prius'));
});

test('Places this device reported rank last among the matches', async () => {
  const before = await run('БЗД эмийн сан');
  assert.ok(before.places && before.places.length === 3);
  const [first, second] = before.places;
  const after = await run('БЗД эмийн сан', { reported: new Set([first]) });
  assert.ok(after.places);
  assert.equal(after.places[0], second);
  assert.ok(!after.places.includes(first));
  const unreported = await run('БЗД эмийн сан', { reported: new Set(['not-a-result']) });
  assert.deepEqual(unreported.places, before.places);
});

test('A storage failure while saving a command surfaces as an error, not a false success', async () => {
  await assert.rejects(
    understand('Ажил нэм: нэг', {
      places,
      personal: emptyPersonal(),
      savePersonal: () => Promise.reject(new Error('disk')),
      reminders: emptyReminders(),
      saveReminders: async () => {},
      payments: emptyPayments(),
      savePayments: async () => {},
      boxes: emptyBoxes(),
      saveBoxes: async () => {},
      stepMs: 0,
    })
  );
});

test('Section 13: the first reminder explains, asks once, schedules through the adapter and stores the notification id; the AI is never asked', async () => {
  const { ask, calls: asked } = fakeAsk(async () => ({ intent }));
  const { adapter, calls } = fakeNotifications(false);
  const explained: string[] = [];
  const got = await run('Сануул: маргааш 10:00 дугуй засвар руу залгах', { ask, notifications: adapter, onExplain: (t) => explained.push(t) });
  assert.equal(asked.length, 0);
  assert.equal(got.aiUsed, false);
  assert.deepEqual(explained, [REMINDER_EXPLANATION]);
  assert.deepEqual(calls, { granted: 1, request: 1, schedule: ['1'], cancel: [], cancelAll: 0 });
  assert.deepEqual(got.steps, ['Хүсэлтийг ойлголоо', PERMISSION_GRANTED_STEP, SCHEDULED_STEP, 'Энэ утсанд хадгаллаа']);
  assert.deepEqual(got.action, { kind: 'reminder_set', id: '1' });
  assert.equal(got.reminders.items[0].notificationId, 'n-1');
  assert.equal(got.reminders.items[0].status, 'scheduled');
  assert.ok(got.text.startsWith('Сануулга 1 · ') && got.text.endsWith('\n' + REMINDER_SET_LINE), got.text);
  assert.equal(got.savedReminders.length, 1);
  assert.equal(got.savedReminders[0], got.reminders);
  assert.equal(got.saved.length, 0);
  assert.equal(got.personal, got.personal);
  // The second reminder: the standing permission is enough, so no explanation and no prompt.
  const second = await run('Сануул: маргааш 11:00 эм авах', { ask, reminders: got.reminders, notifications: adapter, onExplain: (t) => explained.push(t) });
  assert.equal(explained.length, 1);
  assert.deepEqual(calls, { granted: 2, request: 1, schedule: ['1', '2'], cancel: [], cancelAll: 0 });
  assert.deepEqual(second.steps, ['Хүсэлтийг ойлголоо', SCHEDULED_STEP, 'Энэ утсанд хадгаллаа']);
  assert.ok(!JSON.stringify(second.action).includes('эм авах'));
  // Reads and refusals save nothing and touch the phone not at all.
  const list = await run('Сануулгууд', { reminders: second.reminders, notifications: adapter });
  assert.match(list.text, /дугуй засвар/);
  assert.equal(list.savedReminders.length, 0);
  assert.equal(list.action, undefined);
  const past = await run('Сануул: 2020-01-01 10:00 хоцорсон', { reminders: second.reminders, notifications: adapter });
  assert.equal(past.text, PAST_TIME_LINE);
  assert.equal(past.savedReminders.length, 0);
  assert.equal(past.reminders, second.reminders);
  assert.deepEqual(calls.schedule, ['1', '2']);
});

test('AC 13.2: a refused permission keeps the reminder in the plan with notificationId null and says so', async () => {
  const { adapter, calls } = fakeNotifications(false, false);
  const got = await run('Сануул: маргааш 10:00 дугуй засвар руу залгах', { notifications: adapter });
  assert.deepEqual(calls, { granted: 1, request: 1, schedule: [], cancel: [], cancelAll: 0 });
  assert.ok(got.text.endsWith('\n' + REMINDER_DENIED_LINE), got.text);
  assert.deepEqual(got.steps, ['Хүсэлтийг ойлголоо', PERMISSION_DENIED_STEP, 'Энэ утсанд хадгаллаа']);
  assert.equal(got.reminders.items[0].notificationId, null);
  assert.equal(got.reminders.items[0].status, 'scheduled');
  assert.deepEqual(got.action, { kind: 'reminder_set', id: '1' });
  assert.match((await run('Маргаашийн төлөвлөгөө', { reminders: got.reminders })).text, /Сануулга 1 · 10:00 · дугуй засвар руу залгах/);
  // A phone call that fails keeps the reminder too, with its own line.
  const broken: NotificationAdapter = { ...fakeNotifications(true).adapter, schedule: () => Promise.reject(new Error('expo')) };
  const failed = await run('Сануул: маргааш 10:00 дугуй засвар руу залгах', { notifications: broken });
  assert.ok(failed.text.endsWith('\n' + REMINDER_FAILED_LINE));
  assert.ok(failed.steps.includes(SCHEDULE_FAILED_STEP));
  assert.equal(failed.reminders.items[0].notificationId, null);
});

test('Web: without notification support the reminder goes to the plan only and nothing is asked', async () => {
  const web = fakeNotifications(false, true, false);
  for (const notifications of [undefined, web.adapter]) {
    const got = await run('Сануул: маргааш 10:00 дугуй засвар руу залгах', { notifications });
    assert.ok(got.text.endsWith('\n' + REMINDER_WEB_LINE), got.text);
    assert.deepEqual(got.steps, ['Хүсэлтийг ойлголоо', 'Энэ утсанд хадгаллаа']);
    assert.equal(got.reminders.items[0].notificationId, null);
    assert.equal(got.savedReminders.length, 1);
  }
  assert.deepEqual(web.calls, { granted: 0, request: 0, schedule: [], cancel: [], cancelAll: 0 });
});

test('AC 13.3: "Сануулга N устга" cancels the scheduled notification and the reminder leaves the lists', async () => {
  const { adapter, calls } = fakeNotifications(true);
  const set = await run('Ажил 1-ийг маргааш 09:30-д сануул', { personal: (await run('Ажил нэм: дугуй засвар руу залгах')).personal, notifications: adapter });
  assert.equal(set.reminders.items[0].taskId, '1');
  assert.equal(set.reminders.items[0].notificationId, 'n-1');
  const gone = await run('Сануулга 1 устга', { reminders: set.reminders, notifications: adapter });
  assert.deepEqual(calls.cancel, ['n-1']);
  assert.deepEqual(gone.steps, ['Хүсэлтийг ойлголоо', CANCELLED_STEP, 'Энэ утсанд хадгаллаа']);
  assert.equal(gone.reminders.items[0].status, 'cancelled');
  assert.equal(gone.action, undefined);
  assert.equal(gone.savedReminders.length, 1);
  assert.match((await run('Сануулгууд', { reminders: gone.reminders })).text, /сануулга алга/);
  // A reminder that never got a notification is cancelled without a phone call.
  const denied = await run('Сануул: маргааш 10:00 юм', { reminders: gone.reminders, notifications: fakeNotifications(false, false).adapter });
  const dropped = await run('Сануулга 2 устга', { reminders: denied.reminders, notifications: adapter });
  assert.deepEqual(calls.cancel, ['n-1']);
  assert.deepEqual(dropped.steps, ['Хүсэлтийг ойлголоо', 'Энэ утсанд хадгаллаа']);
});

test('A reminder whose store cannot be saved is reported as a failure and its fresh notification is cancelled', async () => {
  const { adapter, calls } = fakeNotifications(true);
  await assert.rejects(
    understand('Сануул: маргааш 10:00 юм', {
      places,
      personal: emptyPersonal(),
      savePersonal: async () => {},
      reminders: emptyReminders(),
      saveReminders: () => Promise.reject(new Error('disk')),
      payments: emptyPayments(),
      savePayments: async () => {},
      boxes: emptyBoxes(),
      saveBoxes: async () => {},
      notifications: adapter,
      stepMs: 0,
    })
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls.schedule, ['1']);
  assert.deepEqual(calls.cancel, ['n-1']);
});

test('Section 7: a nearby request becomes the in-chat question before any position is asked for, and the question carries the intent', async () => {
  const { access, calls } = fakeLocation(() => 'ask', async () => SQUARE);
  const status: string[] = [];
  const got = await run('ойрхон эмийн сан', { location: access, onStatus: (s) => status.push(s) });
  assert.equal(got.text, LOCATION_QUESTION);
  assert.equal(got.question, 'location');
  assert.equal(got.intent?.nearby, true);
  assert.equal(got.intent?.category, 'pharmacy');
  assert.equal(got.places, undefined);
  assert.equal(got.distances, undefined);
  assert.deepEqual(calls, { mode: 1, position: 0 });
  assert.ok(!status.includes(LOCATING_STATUS));
  assert.deepEqual(got.steps, ['Хүсэлтийг ойлголоо']);
  // Paired but failing: the fallback line comes first, then the same question.
  const paired = await run('ойрхон эмийн сан', { ask: failing().ask, location: access });
  assert.equal(paired.text, FALLBACK_LINE + '\n\n' + LOCATION_QUESTION);
  assert.equal(paired.question, 'location');
  // A search that is not nearby never consults the policy.
  await run('БЗД эмийн сан', { location: access });
  assert.equal(calls.mode, 2);
});

test('AC 7.2: with a position the cards come nearest first, the reply counts known locations and the summary shows the location step', async () => {
  const status: string[] = [];
  const { access } = fakeLocation(async () => 'use' as const, async () => SQUARE);
  const got = await run('ойрхон эмийн сан', { location: access, onStatus: (s) => status.push(s) });
  assert.equal(got.question, undefined);
  assert.deepEqual(status, ['Хүсэлтийг ойлгож байна', LOCATING_STATUS, `${pharmacies} эмийн сангаас хайж байна`]);
  assert.deepEqual(got.steps, ['Хүсэлтийг ойлголоо', LOCATED_STEP, `${pharmacies} эмийн сангаас хайлаа`]);
  assert.ok(got.places && got.places.length === 3 && got.distances);
  const distances = got.places.map((id) => got.distances?.[id]);
  for (const d of distances) assert.ok(typeof d === 'number' && d >= 0);
  for (let i = 1; i < distances.length; i++) assert.ok((distances[i - 1] as number) <= (distances[i] as number));
  assert.ok(got.text.endsWith(' ' + knownLocationLine(countLocated(places, 'pharmacy'))));
  assert.ok(!got.text.includes(NOT_SORTED_LINE) && !got.text.includes(LOCATION_DENIED_LINE));
  // Beyond the distances nothing of the position reaches the message, and the intent a follow-up sends onward has no coordinates.
  assert.doesNotMatch(JSON.stringify({ text: got.text, intent: got.intent, places: got.places, steps: got.steps }), /latitude|longitude|47\.9|106\.9/);

  // Records without coordinates rank last with a null distance, in a catalog where only some have a pin.
  const sample = [
    { id: 'far', latitude: 47.95, longitude: 107.0 },
    { id: 'none1', latitude: null, longitude: null },
    { id: 'near', latitude: 47.919, longitude: 106.918 },
    { id: 'none2', latitude: null, longitude: null },
  ].map((p) => ({ ...p, name: p.id, category: 'pharmacy', district: null, address: '', phones: [] })) as unknown as Place[];
  const mixed = await understand('ойрхон эмийн сан', {
    places: sample,
    personal: emptyPersonal(),
    savePersonal: async () => {},
    reminders: emptyReminders(),
    saveReminders: async () => {},
    payments: emptyPayments(),
    savePayments: async () => {},
    boxes: emptyBoxes(),
    saveBoxes: async () => {},
    stepMs: 0,
    location: access,
  });
  assert.deepEqual(mixed.places, ['near', 'far', 'none1']);
  // The fourth waits behind "Дахиад N харах" and carries its distance too.
  assert.deepEqual(mixed.more, ['none2']);
  assert.deepEqual(Object.keys(mixed.distances ?? {}), ['near', 'far', 'none1', 'none2']);
  assert.equal(mixed.distances?.none1, null);
  assert.ok((mixed.distances?.near as number) < (mixed.distances?.far as number));
  assert.ok(mixed.text.includes(knownLocationLine(2)));
});

test('AC 7.4: a refused or failed position gives the district line; a known district still searches, without distance, and says so', async () => {
  const status: string[] = [];
  const { access, calls } = fakeLocation(() => 'use', async () => null);
  const refused = await run('ойрхон эмийн сан', { location: access, onStatus: (s) => status.push(s) });
  assert.equal(refused.text, LOCATION_DENIED_LINE);
  assert.deepEqual(refused.places, []);
  assert.equal(refused.distances, undefined);
  assert.ok(status.includes(LOCATING_STATUS));
  assert.deepEqual(refused.steps, ['Хүсэлтийг ойлголоо', LOCATION_FAILED_STEP]);
  assert.equal(refused.intent?.nearby, true);
  assert.deepEqual(calls, { mode: 1, position: 1 });
  const district = await run('бзд ойрхон эмийн сан', { location: access });
  assert.ok(district.places && district.places.length === 3);
  for (const id of district.places) assert.equal(byId.get(id)?.district, 'БЗД');
  assert.ok(district.text.endsWith(' ' + NOT_SORTED_LINE));
  assert.equal(district.distances, undefined);
  // An adapter that throws counts as no position, never as a failed request.
  const thrown = await run('ойрхон эмийн сан', { location: fakeLocation(() => 'use', () => Promise.reject(new Error('gps'))).access });
  assert.equal(thrown.text, LOCATION_DENIED_LINE);
});

test('Off: after a refusal this session no position is asked for, and a caller without location access gets the same honest reply', async () => {
  const { access, calls } = fakeLocation(() => 'off', async () => SQUARE);
  const noDistrict = await run('ойрхон дугуй засвар', { location: access });
  assert.equal(noDistrict.text, LOCATION_DENIED_LINE);
  assert.deepEqual(noDistrict.places, []);
  const withDistrict = await run('худ ойрхон дугуй засвар', { location: access });
  assert.ok(withDistrict.places && withDistrict.places.length > 0);
  assert.ok(withDistrict.text.includes(NOT_SORTED_LINE));
  assert.deepEqual(calls, { mode: 2, position: 0 });
  assert.equal((await run('худ ойрхон дугуй засвар')).text, withDistrict.text);
  assert.equal((await run('ойрхон дугуй засвар')).text, LOCATION_DENIED_LINE);
});

test('Resuming with the parsed intent skips understanding: the assistant is not asked again and the steps are the location and the search', async () => {
  const { ask, calls } = fakeAsk(async () => ({ intent: nearby }));
  const status: string[] = [];
  const got = await run('ойрхон эмийн сан', { ask, intent: nearby, location: fakeLocation(() => 'use', async () => SQUARE).access, onStatus: (s) => status.push(s) });
  assert.equal(calls.length, 0);
  assert.equal(got.aiUsed, false);
  assert.deepEqual(got.steps, [LOCATED_STEP, `${pharmacies} эмийн сангаас хайлаа`]);
  assert.deepEqual(status, [LOCATING_STATUS, `${pharmacies} эмийн сангаас хайж байна`]);
  assert.ok(got.places && got.places.length === 3 && got.distances);
  assert.ok(Number.isInteger(got.ms));
  assert.equal(got.intent, nearby);
  // Resumed as 'off' with a district (the user chose "Дүүргээ хэлье"): the search runs without distance.
  const off = await run('бзд ойрхон эмийн сан', { ask, intent: { ...nearby, district: 'БЗД' }, location: fakeLocation(() => 'off', async () => SQUARE).access });
  assert.equal(calls.length, 0);
  assert.ok(off.places && off.places.length === 3);
  assert.ok(off.text.endsWith(' ' + NOT_SORTED_LINE));
  assert.deepEqual(off.steps, [`${pharmacies} эмийн сангаас хайлаа`]);
});

test('The composer limit matches what the server accepts', () => {
  assert.equal(MESSAGE_LIMIT, 1000);
  const server = fs.readFileSync(new URL('../server/assistant.ts', import.meta.url), 'utf8');
  assert.match(server, /payload\.message\.length>1000/);
});

test('AC 8.2: with a server URL saved but no aiConsentAt, a request is answered offline and no /assistant call is made', async () => {
  const requests: string[] = [];
  const fetchImpl: typeof fetch = async (url) => {
    requests.push(String(url));
    return new Response(JSON.stringify({ intent, usage: { input: 10, output: 5, total: 15 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const unpaired: LocalState = { saved: [], visits: {}, apiUrl: '', token: '' };
  const paired = withPairing(unpaired, 'http://localhost:8787', 't'.repeat(24));
  assert.equal(aiStatus(paired), 'consent');
  // The chat builds `ask` with assistantFor and offers the disclosure while status is 'consent' (src/screens/chat/index.tsx).
  const chat = (settings: LocalState, offered = false) => ({ ask: assistantFor(settings, fetchImpl), askConsent: aiStatus(settings) === 'consent' && !offered });
  assert.equal(assistantFor(paired, fetchImpl), undefined);

  const got = await run('бзд эмийн сан', chat(paired));
  assert.equal(requests.length, 0);
  assert.equal(got.aiUsed, false);
  assert.ok(got.places && got.places.length > 0);
  for (const id of got.places) assert.equal(byId.get(id)?.district, 'БЗД');
  assert.ok(got.text.startsWith(CONSENT_LINE + '\n\n'));
  assert.equal(got.question, 'consent');
  assert.deepEqual(got.steps, ['Хүсэлтийг ойлголоо', `${pharmacies} эмийн сангаас хайлаа`]);

  // Offered once a session; after that the answer is simply offline. Personal commands never carry the offer.
  const again = await run('бзд эмийн сан', chat(paired, true));
  assert.equal(again.question, undefined);
  assert.ok(!again.text.includes(CONSENT_LINE));
  const task = await run('Ажил нэм: эмийн сан руу залгах', chat(paired));
  assert.equal(task.question, undefined);
  assert.ok(!task.text.includes(CONSENT_LINE));
  assert.equal(requests.length, 0);

  // Once agreed, the same request goes to /assistant; clearing the server URL withdraws the consent again.
  const agreed = withConsent(paired);
  const on = await run('бзд эмийн сан', chat(agreed));
  assert.deepEqual(requests, ['http://localhost:8787/assistant']);
  assert.equal(on.aiUsed, true);
  assert.equal(on.question, undefined);
  const cleared = withPairing(agreed, '', '');
  assert.equal(cleared.aiConsentAt, undefined);
  assert.equal(assistantFor(cleared, fetchImpl), undefined);
  assert.equal(assistantFor(unpaired, fetchImpl), undefined);
  // Agreed but not paired: Nomi's hosted server, not the old address.
  assert.ok(assistantFor({ ...agreed, apiUrl: '' }, fetchImpl));
});

test('Without pairing, an agreed phone gets its own install key on the first AI request, keeps it, and renews it once when refused', async () => {
  const calls: string[] = [];
  let issued = 0, refuseNext = false;
  const fetchImpl: typeof fetch = async (url, init) => {
    const u = String(url), auth = new Headers(init?.headers).get('authorization') ?? '';
    calls.push(u.replace(HOSTED_API_URL, '') + (auth ? ' ' + auth.slice(7) : ''));
    if (u.endsWith('/register')) return Response.json({ token: 'key-' + ++issued });
    if (refuseNext) { refuseNext = false; return Response.json({ error: 'pairing_required' }, { status: 401 }); }
    return Response.json({ intent, usage: { input: 10, output: 5, total: 15 } });
  };
  const keys = memoryInstallKeys();
  const agreed = withConsent({ saved: [], visits: {}, apiUrl: '', token: '' });
  // Before the agreement there is no ask, so nothing (not even /register) reaches the server.
  assert.equal(assistantFor({ ...agreed, aiConsentAt: undefined }, fetchImpl, keys), undefined);
  assert.deepEqual(calls, []);
  const ask = assistantFor(agreed, fetchImpl, keys)!;
  await ask('бзд эмийн сан');
  await ask('ойрхон эмийн сан');
  assert.deepEqual(calls, ['/register', '/assistant key-1', '/assistant key-1']);
  assert.equal(await keys.get(), 'key-1');
  refuseNext = true;
  await ask('дугуй засвар');
  assert.deepEqual(calls.slice(3), ['/assistant key-1', '/register', '/assistant key-2']);
  assert.equal(await keys.get(), 'key-2');
});

test('A night search shows only places open past midnight or around the clock, and goes city-wide when the district has none', async () => {
  const got = await run('БЗД шөнө ажилладаг эмийн сан');
  assert.ok(got.places && got.places.length > 0);
  for (const id of got.places) {
    const p = byId.get(id)!;
    assert.equal(p.district, 'БЗД');
    assert.ok(openAtNight(p.hoursClaim), p.name + ': ' + p.hoursClaim);
  }
  assert.ok(got.text.includes(NIGHT_LINE));
  // Багахангай lists no pharmacy open at night: the reply says so and shows ones elsewhere in the city.
  const wider = await run('Багахангай шөнө ажилладаг эмийн сан');
  assert.ok(wider.places && wider.places.length > 0);
  for (const id of wider.places) assert.ok(openAtNight(byId.get(id)!.hoursClaim));
  assert.ok(wider.text.startsWith('Багахангай-д шөнө ажилладаг гэж бичсэн газар олдсонгүй.'));
  // An ordinary search is not filtered and does not carry the line.
  assert.ok(!(await run('БЗД эмийн сан')).text.includes(NIGHT_LINE));
});

test('A search that says neither where nor "near me" asks for the position, sorts by distance once allowed, and asks for the district without one', async () => {
  const ask = fakeLocation(() => 'ask', async () => SQUARE);
  const asked = await run('шөнө ажилладаг эмийн сан', { location: ask.access });
  assert.equal(asked.question, 'location');
  assert.equal(asked.text, LOCATION_QUESTION);
  // Allowed: the nearest pharmacies open at night, with distances.
  const use = fakeLocation(() => 'use', async () => SQUARE);
  const located = await run('шөнө ажилладаг эмийн сан', { location: use.access });
  assert.ok(located.places && located.places.length > 0 && located.distances);
  for (const id of located.places) assert.ok(openAtNight(byId.get(id)!.hoursClaim));
  const d = located.places.map((id) => located.distances![id] ?? Infinity);
  assert.deepEqual(d, [...d].sort((a, b) => a - b));
  // No position: no random city-wide list, the district is asked for instead.
  const off = await run('эмийн сан', { location: fakeLocation(() => 'off', async () => SQUARE).access });
  assert.equal(off.text, LOCATION_DENIED_LINE);
  assert.deepEqual(off.places, []);
  // Naming a district still searches straight away.
  assert.ok((await run('БЗД эмийн сан', { location: ask.access })).places!.length > 0);
});

test('A district without the category shows the rest of the city and says so; a category with no place yet says that plainly', async () => {
  const counts = new Map<string, number>();
  for (const p of places) counts.set(`${p.category}|${p.district}`, (counts.get(`${p.category}|${p.district}`) ?? 0) + 1);
  // A category with places, but none in Багахангай.
  const cat = [...new Set(places.map((p) => p.category))].find((c) => !counts.get(`${c}|Багахангай`) && places.filter((p) => p.category === c).length >= 3)!;
  const name = (await import('./category-match.ts')).categoryName(cat);
  const got = await run('Багахангай ' + name);
  assert.equal(got.intent?.category, cat);
  assert.ok(got.places && got.places.length > 0);
  assert.ok(got.text.startsWith('Багахангай-д олдсонгүй. Хотын бусад хэсгээс'), got.text);
  // A registry category with no place at all.
  const { CATEGORY_DATA } = await import('../data/categories.ts');
  const { relatedCategory } = await import('./category-match.ts');
  const all: Record<string, number> = {};
  for (const p of places) for (const c of [p.category, ...(p.alsoCategories ?? [])]) all[c] = (all[c] ?? 0) + 1;
  const empty = CATEGORY_DATA.find((c) => !all[c.id] && !relatedCategory(c.id, all))!;
  const none = await run('БЗД ' + empty.mn);
  assert.equal(none.intent?.category, empty.id);
  assert.ok(none.text.includes('одоогоор Nomi-д бүртгэлтэй газар алга'), none.text);
});

test('A category with no place of its own answers with a related one that may offer it, and says to call', async () => {
  const has = (id: string) => places.some((p) => inCategory(p, id));
  assert.ok(!has('phone_screen') && has('phone_repair'));
  const got = await run('СБД утасны дэлгэц солих');
  assert.equal(got.intent?.category, 'phone_screen');
  assert.ok(got.places && got.places.length > 0);
  for (const id of got.places) assert.ok(inCategory(byId.get(id)!, 'phone_repair'));
  assert.ok(got.text.startsWith('Утасны дэлгэц солих: тусгайлан бүртгэсэн газар алга. Утас засвар'), got.text);
});

test('A business that comes to you: no position is asked, those serving the district come first, and the cards lead with the call', async () => {
  const plumber = (id: string, district: string | null, flags: string[] = [], extra: Partial<Place> = {}) =>
    ({ id, name: id, category: 'plumber', district, address: '', phones: ['99000000'], latitude: null, longitude: null, mapUrl: null, sources: [], hoursClaim: '', qualityFlags: flags, retrievedAt: '', verifiedAt: null, checkStatus: '', ...extra }) as Place;
  const sample = [
    plumber('bgd', 'БГД'),
    plumber('bzd', 'БЗД'),
    plumber('anywhere', null, ['mobile_service']),
    plumber('named', 'СХД', [], { serviceAreas: ['СХД', 'БЗД'] }),
  ];
  const ask = (text: string, location?: LocationAccess) =>
    understand(text, {
      places: sample, personal: emptyPersonal(), savePersonal: async () => {}, reminders: emptyReminders(), saveReminders: async () => {},
      payments: emptyPayments(), savePayments: async () => {}, boxes: emptyBoxes(), saveBoxes: async () => {}, stepMs: 0, location,
    });
  const { access, calls } = fakeLocation(async () => 'ask' as const, async () => SQUARE);
  const bzd = await ask('БЗД сантехникч', access);
  assert.equal(bzd.intent?.category, 'plumber');
  assert.equal(bzd.oncall, true);
  assert.equal(bzd.question, undefined);
  assert.equal(calls.mode + calls.position, 0);
  // БЗД's own, the one that named БЗД and the one that named no district serve it; БГД's comes after them.
  assert.deepEqual([...(bzd.places ?? []), ...(bzd.more ?? [])].at(-1), 'bgd');
  assert.ok(bzd.text.startsWith('БЗД-д очиж үйлчилдэг'), bzd.text);
  // No district: the whole city, and how to get the district's first.
  const city = await ask('сантехникч хэрэгтэй', access);
  assert.equal(city.question, undefined);
  assert.ok(city.text.startsWith('Танай хаяг дээр очиж үйлчилдэг'), city.text);
});

test('Tire repair is offered by shops and by businesses that come to you: those get their own section', async () => {
  const tire = (id: string, district: string | null, flags: string[] = []) =>
    ({ id, name: id, category: 'tire', district, address: '', phones: ['99000001'], latitude: null, longitude: null, mapUrl: null, sources: [], hoursClaim: '', qualityFlags: flags, retrievedAt: '', verifiedAt: null, checkStatus: '' }) as Place;
  const sample = [tire('shop1', 'БЗД'), tire('shop2', 'БЗД'), tire('shop3', 'БЗД'), tire('mobile', null, ['mobile_service'])];
  const got = await understand('БЗД дугуй засвар', {
    places: sample, personal: emptyPersonal(), savePersonal: async () => {}, reminders: emptyReminders(), saveReminders: async () => {},
    payments: emptyPayments(), savePayments: async () => {}, boxes: emptyBoxes(), saveBoxes: async () => {}, stepMs: 0,
  });
  assert.equal(got.intent?.category, 'tire');
  assert.equal(got.oncall, undefined);
  assert.deepEqual(got.places, ['shop1', 'shop2', 'shop3']);
  assert.deepEqual(got.comes, ['mobile']);
});
