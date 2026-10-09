import type { Intent } from './core.ts';
import { askAssistant, AssistantError, type AssistantReply } from './assistant-api.ts';

/** Where the install key is kept: SecureStore on the phone (storage.ts `installKeyStore`), a variable in tests. */
export type InstallKeyStore = { get: () => Promise<string | null>; set: (key: string) => Promise<void>; clear: () => Promise<void> };

export function memoryInstallKeys(): InstallKeyStore {
  let key: string | null = null;
  return {
    get: async () => key,
    set: async (k) => void (key = k),
    clear: async () => void (key = null),
  };
}

/** POST /register on Nomi's hosted server: a new install key, with no sign-up and nothing about the user sent. */
export async function registerInstall(apiUrl: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const response = await fetchImpl(apiUrl.replace(/\/$/, '') + '/register', { method: 'POST', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new AssistantError(response.status, '');
  const body = await response.json();
  if (!body || typeof body.token !== 'string' || !body.token) throw new AssistantError(502, 'invalid_registration');
  return body.token;
}

/**
 * Asks Nomi's hosted server with this install's key. The key is fetched once, on the first request after consent (nothing reaches
 * the server before that), and kept. A refused key (the server's secret changed, or this install was blocked) is dropped and a
 * new one fetched, once per request.
 */
export function hostedAsk(apiUrl: string, keys: InstallKeyStore, fetchImpl: typeof fetch = fetch) {
  let pending: Promise<string> | null = null;
  const fresh = () =>
    (pending ??= registerInstall(apiUrl, fetchImpl)
      .then(async (key) => {
        await keys.set(key).catch(() => undefined);
        return key;
      })
      .finally(() => (pending = null)));
  const current = async () => (await keys.get().catch(() => null)) || fresh();
  return async (message: string, previous?: Intent): Promise<AssistantReply> => {
    const key = await current();
    try {
      return await askAssistant({ apiUrl, token: key }, message, previous, fetchImpl);
    } catch (error) {
      if (!(error instanceof AssistantError) || error.status !== 401) throw error;
      await keys.clear().catch(() => undefined);
      return askAssistant({ apiUrl, token: await fresh() }, message, previous, fetchImpl);
    }
  };
}
