import test from 'node:test';
import assert from 'node:assert/strict';
import {
  answeredToday,
  answerFollowup,
  deferFollowup,
  emptyFollowups,
  FOLLOWUP_AWAY_MS,
  FOLLOWUP_CHOICES,
  FOLLOWUP_DROPPED_LINE,
  FOLLOWUP_EXPIRY_MS,
  FOLLOWUP_LATER_LIMIT,
  FOLLOWUP_LATER_LINE,
  FOLLOWUP_RECHECK_LINE,
  FOLLOWUP_THANKS,
  followupQuestion,
  planFollowup,
  restoreFollowups,
  withCall,
  type FollowupStore,
  type FollowupTrigger,
} from './followups.ts';
import { addReport, emptyReports, reportedPlaces, restoreReports, serializeReports } from './reports.ts';

/** 14:02 on 2026-09-18 in Ulaanbaatar. */
const now = new Date('2026-09-18T06:02:00Z');
const after = (ms: number) => new Date(now.getTime() + ms);
const launch: FollowupTrigger = { kind: 'launch' };
const back = (awayMs: number): FollowupTrigger => ({ kind: 'foreground', awayMs });
const called = (placeId = 'pharmacy-1', at = now, store: FollowupStore = emptyFollowups()) => withCall(store, placeId, at);
const feedback = (placeId: string, outcome: (typeof FOLLOWUP_CHOICES)[number]['key']) => ({ kind: 'followup' as const, placeId, outcome, appVersion: '1.0.0' });

test('AC 14.3: without a call there is never a follow-up', () => {
  for (const trigger of [launch, back(0), back(FOLLOWUP_AWAY_MS), back(3600000)]) {
    const plan = planFollowup(emptyFollowups(), trigger, now);
    assert.equal(plan.ask, null, trigger.kind);
    assert.deepEqual(plan.store, emptyFollowups());
  }
  // Only a call queues anything: exactly one item, nothing asked yet.
  assert.deepEqual(called(), { pending: [{ placeId: 'pharmacy-1', calledAt: now.toISOString(), laterCount: 0 }] });
});

test('A return to the foreground asks after 30 seconds away, a launch asks at once; one question per trigger, the latest call first', () => {
  assert.equal(FOLLOWUP_AWAY_MS, 30_000);
  const store = called();
  assert.equal(planFollowup(store, back(FOLLOWUP_AWAY_MS - 1), after(FOLLOWUP_AWAY_MS)).ask, null);
  const asked = planFollowup(store, back(FOLLOWUP_AWAY_MS), after(FOLLOWUP_AWAY_MS));
  assert.equal(asked.ask?.placeId, 'pharmacy-1');
  assert.equal(asked.ask?.askedAt, after(FOLLOWUP_AWAY_MS).toISOString());
  assert.deepEqual(asked.store.pending, [asked.ask]);
  assert.equal(planFollowup(store, launch, after(1000)).ask?.placeId, 'pharmacy-1');
  // Two calls: the more recent place is asked first; the other waits for the next trigger.
  const two = called('tire-7', after(60000), store);
  const first = planFollowup(two, back(45000), after(120000));
  assert.equal(first.ask?.placeId, 'tire-7');
  assert.equal(first.store.pending.length, 2);
  assert.equal(first.store.pending.find((p) => p.placeId === 'pharmacy-1')?.askedAt, undefined);
  const second = planFollowup(first.store, back(45000), after(200000));
  assert.equal(second.ask?.placeId, 'pharmacy-1');
  // Both asked and neither answered (the app was closed on the question): the one asked longest ago comes first.
  assert.equal(planFollowup(second.store, launch, after(300000)).ask?.placeId, 'tire-7');
});

test('A doubled trigger posts nothing twice: a question is not repeated within 30 seconds', () => {
  const asked = planFollowup(called(), launch, after(1000));
  assert.ok(asked.ask);
  assert.equal(planFollowup(asked.store, launch, after(1000)).ask, null);
  assert.equal(planFollowup(asked.store, launch, after(1500)).ask, null);
  assert.equal(planFollowup(asked.store, back(60000), after(1000 + FOLLOWUP_AWAY_MS - 1)).ask, null);
  assert.equal(planFollowup(asked.store, back(60000), after(1000 + FOLLOWUP_AWAY_MS)).ask?.placeId, 'pharmacy-1');
});

test('"Дараа" asks again on a later trigger and drops the question after two; a question left unanswered counts the same', () => {
  assert.equal(FOLLOWUP_LATER_LIMIT, 2);
  let plan = planFollowup(called(), launch, after(1000));
  let later = answerFollowup(plan.store, 'pharmacy-1', 'later');
  assert.equal(later.reply, FOLLOWUP_LATER_LINE);
  assert.equal(later.store.pending[0].laterCount, 1);
  plan = planFollowup(later.store, back(60000), after(120000));
  assert.equal(plan.ask?.placeId, 'pharmacy-1');
  later = answerFollowup(plan.store, 'pharmacy-1', 'later');
  assert.equal(later.reply, FOLLOWUP_DROPPED_LINE);
  assert.deepEqual(later.store, emptyFollowups());
  assert.equal(planFollowup(later.store, launch, after(200000)).ask, null);
  // Typing instead of answering, or starting a new conversation, defers the same way, without an outcome.
  const dismissed = deferFollowup(planFollowup(called(), launch, after(1000)).store, 'pharmacy-1');
  assert.equal(dismissed.dropped, false);
  assert.equal(dismissed.store.pending[0].laterCount, 1);
  assert.equal(deferFollowup(dismissed.store, 'pharmacy-1').dropped, true);
  assert.deepEqual(deferFollowup(dismissed.store, 'pharmacy-1').store, emptyFollowups());
  assert.equal(deferFollowup(emptyFollowups(), 'pharmacy-1').dropped, true);
  // A store restored with a count at the limit is not asked either.
  assert.equal(planFollowup({ pending: [{ placeId: 'p', calledAt: now.toISOString(), laterCount: 2 }] }, launch, after(1000)).ask, null);
});

test('A pending call expires after 24 hours; a place gone from the catalog is dropped', () => {
  assert.equal(FOLLOWUP_EXPIRY_MS, 24 * 3600000);
  const store = called();
  assert.equal(planFollowup(store, launch, after(FOLLOWUP_EXPIRY_MS - 1)).ask?.placeId, 'pharmacy-1');
  const expired = planFollowup(store, launch, after(FOLLOWUP_EXPIRY_MS));
  assert.equal(expired.ask, null);
  assert.deepEqual(expired.store, emptyFollowups());
  assert.equal(planFollowup(store, back(FOLLOWUP_AWAY_MS), after(FOLLOWUP_EXPIRY_MS + 1000)).ask, null);
  const gone = planFollowup(store, launch, after(1000), () => false);
  assert.equal(gone.ask, null);
  assert.deepEqual(gone.store, emptyFollowups());
  assert.equal(planFollowup(store, launch, after(1000), (id) => id === 'pharmacy-1').ask?.placeId, 'pharmacy-1');
  // An untouched store keeps its reference, so nothing is written for nothing.
  assert.equal(planFollowup(store, back(1000), after(1000)).store, store);
});

test('One follow-up per place per day: a place answered today is not queued again; a repeated call keeps one item', () => {
  let reports = addReport(emptyReports(), feedback('pharmacy-1', 'helped'), now).store;
  reports = addReport(reports, feedback('tire-7', 'later'), now).store;
  reports = addReport(reports, { kind: 'report', placeId: 'tire-8', reason: 'closed', appVersion: '1.0.0' }, now).store;
  // "Дараа" is not an answer, and a card report is not a follow-up.
  const answered = answeredToday(reports.items, after(3600000));
  assert.deepEqual([...answered], ['pharmacy-1']);
  const empty = emptyFollowups();
  assert.equal(withCall(empty, 'pharmacy-1', after(3600000), answered), empty);
  assert.equal(withCall(empty, 'tire-7', after(3600000), answered).pending.length, 1);
  assert.equal(withCall(empty, 'tire-8', after(3600000), answered).pending.length, 1);
  // Days are Ulaanbaatar days: an answer at 23:30 UB is yesterday's by 00:30 the next day.
  const late = addReport(emptyReports(), feedback('p', 'not_helped'), new Date('2026-09-18T15:30:00Z')).store;
  assert.deepEqual([...answeredToday(late.items, new Date('2026-09-18T15:59:00Z'))], ['p']);
  assert.deepEqual([...answeredToday(late.items, new Date('2026-09-18T16:30:00Z'))], []);
  // The same place called twice waits once, with the later call time and its count kept.
  const deferred = deferFollowup(called(), 'pharmacy-1').store;
  const again = withCall(deferred, 'pharmacy-1', after(5000));
  assert.deepEqual(again.pending, [{ placeId: 'pharmacy-1', calledAt: after(5000).toISOString(), laterCount: 1 }]);
});

test('AC 14.2 and 14.4: every answer is stored as feedback and exported with the place id; Хаагдсан and Утас буруу mark the place as reported', () => {
  const store = planFollowup(called(), launch, after(1000)).store;
  let reports = emptyReports();
  for (const choice of FOLLOWUP_CHOICES) {
    const added = addReport(reports, feedback('pharmacy-1', choice.key), after(2000));
    assert.ok(added.report, choice.key);
    assert.equal(added.report.outcome, choice.key);
    assert.equal(added.report.reason, null);
    reports = added.store;
  }
  const out = JSON.parse(serializeReports(reports));
  assert.deepEqual(
    out.items.map((i: { kind: string; placeId: string; outcome: string }) => [i.kind, i.placeId, i.outcome]),
    FOLLOWUP_CHOICES.map((c) => ['followup', 'pharmacy-1', c.key])
  );
  const closed = out.items.find((i: { outcome: string }) => i.outcome === 'closed');
  assert.deepEqual(Object.keys(closed), ['id', 'kind', 'placeId', 'reason', 'outcome', 'note', 'createdAt', 'appVersion']);
  assert.equal(closed.placeId, 'pharmacy-1');
  assert.deepEqual(restoreReports(out), reports);
  // The answer that says the place is closed or unreachable is a report of it: "Та мэдэгдсэн" and reported-last, no second explanation.
  for (const [outcome, expected] of [['closed', ['a']], ['wrong_phone', ['a']], ['helped', []], ['not_helped', []], ['later', []]] as const) {
    assert.deepEqual([...reportedPlaces(addReport(emptyReports(), feedback('a', outcome), now).store)], expected, outcome);
  }
  // The replies, and a final answer closes the item.
  assert.equal(answerFollowup(store, 'pharmacy-1', 'helped').reply, FOLLOWUP_THANKS);
  assert.equal(answerFollowup(store, 'pharmacy-1', 'not_helped').reply, FOLLOWUP_THANKS);
  assert.equal(answerFollowup(store, 'pharmacy-1', 'closed').reply, FOLLOWUP_RECHECK_LINE);
  assert.equal(answerFollowup(store, 'pharmacy-1', 'wrong_phone').reply, FOLLOWUP_RECHECK_LINE);
  assert.deepEqual(answerFollowup(store, 'pharmacy-1', 'helped').store, emptyFollowups());
  assert.equal(planFollowup(answerFollowup(store, 'pharmacy-1', 'closed').store, launch, after(100000)).ask, null);
});

test('The question names the place, a pharmacy as one; the five answers in order', () => {
  assert.equal(followupQuestion({ name: 'Дугуй засвар 24', category: 'tire' }), 'Дугуй засвар 24 — таны хэрэгтэйг олж өгсөн үү?');
  assert.equal(followupQuestion({ name: 'Simber', category: 'materials' }), 'Simber — таны хэрэгтэйг олж өгсөн үү?');
  assert.equal(followupQuestion({ name: 'Монос 12', category: 'pharmacy' }), 'Монос 12 эмийн сан — таны хэрэгтэйг олж өгсөн үү?');
  assert.equal(followupQuestion({ name: 'Apteka эмийн сан - Мичид ', category: 'pharmacy' }), 'Apteka эмийн сан - Мичид — таны хэрэгтэйг олж өгсөн үү?');
  assert.deepEqual(
    FOLLOWUP_CHOICES.map((c) => c.label),
    ['Тийм', 'Үгүй', 'Хаагдсан', 'Утас буруу', 'Дараа']
  );
  assert.deepEqual(
    FOLLOWUP_CHOICES.map((c) => c.key),
    ['helped', 'not_helped', 'closed', 'wrong_phone', 'later']
  );
});

test('The store survives a round trip; malformed items and unknown shapes are dropped', () => {
  const store = planFollowup(called('tire-7', after(1000), called()), launch, after(2000)).store;
  assert.deepEqual(restoreFollowups(JSON.parse(JSON.stringify(store))), store);
  const good = { placeId: 'p', calledAt: now.toISOString(), laterCount: 0 };
  const bad = [
    null,
    { ...good, placeId: '' },
    { ...good, placeId: 'x'.repeat(81) },
    { ...good, calledAt: 'yesterday' },
    { ...good, laterCount: -1 },
    { ...good, laterCount: 1.5 },
    { ...good, laterCount: undefined },
    { ...good, askedAt: 'soon' },
  ];
  assert.deepEqual(restoreFollowups({ pending: [good, ...bad] }).pending, [good]);
  assert.deepEqual(restoreFollowups({ pending: [{ ...good, note: 'secret' }] }).pending, [good]);
  assert.deepEqual(restoreFollowups({ pending: [good, { ...good, laterCount: 1 }] }).pending, [{ ...good, laterCount: 1 }]);
  assert.deepEqual(restoreFollowups(null), emptyFollowups());
  assert.deepEqual(restoreFollowups({ items: [] }), emptyFollowups());
  assert.deepEqual(restoreFollowups({ pending: 'no' }), emptyFollowups());
});
