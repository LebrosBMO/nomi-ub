import type { Intent } from './core.ts';
import { readDaily, readTokens, type ServerDaily, type TokenUsage } from './usage.ts';

/** What the paired server answered. `intent` is validated by the caller before anything uses it. */
export type AssistantReply = { intent: unknown; tokens?: TokenUsage; daily?: ServerDaily };

/** A non-OK answer from the server: the HTTP status and the server's error code, so a daily cap can be told from an outage. */
export class AssistantError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(`assistant_${status}${code ? '_' + code : ''}`);
    this.name = 'AssistantError';
    this.status = status;
    this.code = code;
  }
}

async function errorCode(response: Response) {
  try {
    const body = await response.json();
    return body && typeof body.error === 'string' ? body.error : '';
  } catch {
    return '';
  }
}

/**
 * Calls the paired Nomi server (server/index.ts). Only the request text and the previous intent leave the device: never the
 * catalog, a position or the conversation (AC 7.3). The OpenAI key stays on the server. `fetchImpl` is injected by tests.
 */
export async function askAssistant(
  server: { apiUrl: string; token: string },
  message: string,
  previous?: Intent,
  fetchImpl: typeof fetch = fetch
): Promise<AssistantReply> {
  const response = await fetchImpl(server.apiUrl.replace(/\/$/, '') + '/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + server.token },
    body: JSON.stringify({ message, previous }),
    signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) throw new AssistantError(response.status, await errorCode(response));
  const body = await response.json();
  return { intent: body?.intent, tokens: readTokens(body?.usage), daily: readDaily(body?.daily) };
}
