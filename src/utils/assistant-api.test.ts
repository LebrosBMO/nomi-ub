import test from 'node:test';
import assert from 'node:assert/strict';
import { askAssistant, AssistantError } from './assistant-api.ts';
import { validateIntent, type Intent } from './core.ts';

const INTENT_KEYS = ['action', 'category', 'clarification', 'district', 'nearby', 'openNow', 'query'];
const nearby: Intent = { category: 'pharmacy', district: null, query: 'ойрхон эмийн сан', nearby: true, openNow: false, action: 'search', clarification: null };
const server = { apiUrl: 'http://localhost:8787/', token: 't'.repeat(24) };

/** A fetch that records every request and answers with one fixed body. */
function fakeFetch(reply: unknown, status = 200) {
  const requests: { url: string; body: string; headers: Record<string, string> }[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), body: String(init?.body), headers: (init?.headers ?? {}) as Record<string, string> });
    return new Response(JSON.stringify(reply), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchImpl, requests };
}

test('AC 7.3: the /assistant body holds only the message and the previous intent, never latitude or longitude', async () => {
  const { fetchImpl, requests } = fakeFetch({ intent: nearby, usage: { input: 10, output: 5, total: 15 }, daily: { used: 1, limit: 200 } });
  const reply = await askAssistant(server, 'ойрхон эмийн сан', nearby, fetchImpl);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'http://localhost:8787/assistant');
  assert.equal(requests[0].headers.Authorization, 'Bearer ' + server.token);
  const body = JSON.parse(requests[0].body);
  assert.deepEqual(Object.keys(body).sort(), ['message', 'previous']);
  assert.equal(body.message, 'ойрхон эмийн сан');
  assert.deepEqual(Object.keys(body.previous).sort(), INTENT_KEYS);
  assert.equal(body.previous.nearby, true);
  assert.doesNotMatch(requests[0].body, /latitude|longitude|coords|position/i);
  assert.deepEqual(reply.tokens, { input: 10, output: 5, total: 15 });
  assert.deepEqual(reply.daily, { used: 1, limit: 200 });
  // Without a previous intent the body is the message alone.
  await askAssistant(server, 'бзд эмийн сан', undefined, fetchImpl);
  assert.deepEqual(Object.keys(JSON.parse(requests[1].body)), ['message']);
  // The intent contract has no room for a position: validation keeps only the seven fields, whatever else came along.
  assert.deepEqual(Object.keys(validateIntent({ ...nearby, latitude: 47.9, longitude: 106.9 })).sort(), INTENT_KEYS);
});

test('A non-OK answer becomes an AssistantError carrying the status and the server code', async () => {
  await assert.rejects(
    askAssistant(server, 'x', undefined, fakeFetch({ error: 'daily_limit' }, 429).fetchImpl),
    (error: unknown) => error instanceof AssistantError && error.status === 429 && error.code === 'daily_limit'
  );
  await assert.rejects(
    askAssistant(server, 'x', undefined, fakeFetch('', 503).fetchImpl),
    (error: unknown) => error instanceof AssistantError && error.status === 503 && error.code === ''
  );
});
