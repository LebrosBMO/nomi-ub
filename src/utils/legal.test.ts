import test from 'node:test';
import assert from 'node:assert/strict';
import { needsTerms, PRIVACY, TERMS, TERMS_VERSION, WELCOME_POINTS, withTerms } from './legal.ts';
import { aiStatus, readState, withoutConsent, type LocalState } from './storage.ts';

const fresh = (): LocalState => ({ saved: [], visits: {}, apiUrl: '', token: '' });
const NOW = new Date('2026-10-07T03:00:00Z');

test('The first screen stays until the current terms are accepted; a new version shows it again', () => {
  assert.equal(needsTerms(fresh()), true);
  const accepted = withTerms(fresh(), true, NOW);
  assert.equal(needsTerms(accepted), false);
  assert.equal(needsTerms({ ...accepted, termsVersion: '2026-01-01' }), true);
  // The acceptance survives a save and a reload; a malformed date is dropped, so the screen shows again.
  assert.equal(needsTerms(readState(JSON.stringify(accepted))), false);
  assert.equal(needsTerms(readState(JSON.stringify({ ...accepted, termsAcceptedAt: 'not a date' }))), true);
});

test('"Зөвшөөрч эхлэх" also turns the AI on, so the chat never asks; "AI-гүйгээр эхлэх" accepts the terms only', () => {
  const withAi = withTerms(fresh(), true, NOW);
  assert.equal(withAi.termsAcceptedAt, NOW.toISOString());
  assert.equal(withAi.termsVersion, TERMS_VERSION);
  assert.equal(aiStatus(withAi), 'on');
  const without = withTerms(fresh(), false, NOW);
  assert.equal(without.termsVersion, TERMS_VERSION);
  assert.equal(aiStatus(without), 'consent');
  // "AI-г унтраах" in Settings withdraws it again and keeps the terms.
  const off = withoutConsent(withAi);
  assert.equal(aiStatus(off), 'consent');
  assert.equal(needsTerms(off), false);
});

test('The first screen and the privacy policy say what leaves the phone, and the terms say Nomi gives no medicine advice', () => {
  assert.ok(WELCOME_POINTS.some((line) => line.includes('OpenAI')));
  assert.ok(WELCOME_POINTS.some((line) => line.includes('утсанд л үлдэнэ')));
  const privacy = PRIVACY.sections.map((s) => s.body).join(' ');
  for (const word of ['OpenAI', 'Байршил хадгалагдахгүй', 'Миний өгөгдлийг устгах', 'унтрааж болно']) assert.ok(privacy.includes(word), word);
  assert.ok(TERMS.sections.some((s) => s.body.includes('эмийн талаар зөвлөгөө өгөхгүй')));
  assert.ok(TERMS.sections.some((s) => s.body.includes('103')));
});
