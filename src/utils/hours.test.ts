import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultWeek, formatHours, TIMES, type Week } from './hours.ts';

const week = (make: (index: number) => Partial<Week[number]>): Week =>
  Array.from({ length: 7 }, (_, i) => ({ closed: false, allDay: false, open: '09:00', close: '18:00', ...make(i) }));

test('The week becomes one line, with days that agree joined like Google writes them', () => {
  assert.equal(formatHours(defaultWeek()), 'Да-Ба 09:00-18:00, Бя 10:00-16:00, Ня амарна');
  assert.equal(formatHours(week(() => ({}))), 'Да-Ня 09:00-18:00');
  // Only days next to each other join: a Wednesday off splits the week in two.
  assert.equal(formatHours(week((i) => (i === 2 ? { closed: true } : {}))), 'Да-Мя 09:00-18:00, Лх амарна, Пү-Ня 09:00-18:00');
  assert.equal(formatHours(week((i) => (i < 5 ? {} : { open: '11:00', close: '15:00' }))), 'Да-Ба 09:00-18:00, Бя-Ня 11:00-15:00');
});

test('Around the clock and never open are said plainly, not as 00:00-00:00', () => {
  assert.equal(formatHours(week(() => ({ allDay: true }))), '24 цаг');
  assert.equal(formatHours(week((i) => (i === 6 ? { closed: true } : { allDay: true }))), 'Да-Бя 24 цаг, Ня амарна');
  // A business open no day of the week has nothing to publish, so nothing is sent.
  assert.equal(formatHours(week(() => ({ closed: true }))), '');
  assert.equal(formatHours([]), '');
});

test('Times are offered in half hours, from midnight to half past eleven', () => {
  assert.equal(TIMES.length, 48);
  assert.equal(TIMES[0], '00:00');
  assert.equal(TIMES[1], '00:30');
  assert.equal(TIMES[19], '09:30');
  assert.equal(TIMES.at(-1), '23:30');
});
