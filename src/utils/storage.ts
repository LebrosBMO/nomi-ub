import type { Visit } from './core';
import { HOSTED_API_URL } from './hosted.ts';

/**
 * `nomi:pilot:v1`, the settings. onboardedAt: ISO time of the first launch, set once the welcome principles have been shown.
 * locationAsked: the location question in chat has been answered at least once (Section 7); the position itself is never stored.
 * aiConsentAt: when the user agreed to the AI disclosure (Section 8); aiConsentFor: the provider that disclosure named, so consent
 * given for an earlier provider asks again. Clearing the server URL removes both. termsAcceptedAt and termsVersion: when the first
 * screen's Terms of Use and Privacy Policy were accepted, and which version (legal.ts). `token` is the pairing
 * token in memory; on Android and iOS it is saved in SecureStore and this store keeps ''. The optional fields are absent for
 * stores written before they existed.
 */
export type LocalState = {
  saved: string[];
  visits: Record<string, Visit>;
  apiUrl: string;
  token: string;
  onboardedAt?: string;
  locationAsked?: boolean;
  aiConsentAt?: string;
  aiConsentFor?: string;
  termsAcceptedAt?: string;
  termsVersion?: string;
};
export const emptyState: LocalState = { saved: [], visits: {}, apiUrl: '', token: '' };

export const PILOT_KEY = 'nomi:pilot:v1';
/** The SecureStore key of the pairing token (keys may hold letters, digits, `.`, `-` and `_`). */
export const TOKEN_KEY = 'nomi.pairing.token';
/** The server wants at least 24 characters; the upper bound keeps the SecureStore value small (some iOS releases refused ~2 KB). */
/** The SecureStore key of the install key a phone gets from Nomi's hosted server without pairing (install.ts). */
export const INSTALL_KEY = 'nomi.install.key';
/** Where the install key lives on web, which has no SecureStore. */
export const INSTALL_WEB_KEY = 'nomi:install:v1';
export const TOKEN_MIN = 24;
export const TOKEN_MAX = 512;

/**
 * Every AsyncStorage key the app writes, for "delete my data" (Section 8). Deletion also sweeps any other `nomi:` key it finds;
 * storage.test.ts checks that this list covers every key named in the source.
 */
export const NOMI_KEYS = [
  'nomi:chat:v1', // яриа
  PILOT_KEY, // холболт, settings
  'nomi:personal:v1', // ажил, санамж
  'nomi:payments:v1', // сарын төлбөр
  'nomi:boxes:v1', // бүртгэл (зардал)
  'nomi:reminders:v1', // сануулга
  'nomi:reports:v1', // мэдэгдэл
  'nomi:activity:v1', // үйлдлийн түүх
  'nomi:usage:v1', // хэрэглээ
  'nomi:followups:v1', // the question after a call
  INSTALL_WEB_KEY, // холболт: the install key, on web only
] as const;
/** What "Миний өгөгдлийг устгах" says will go, in this order. */
export const DELETED_DATA = ['яриа', 'ажил', 'санамж', 'төлбөр', 'зардал', 'сануулга', 'мэдэгдэл', 'үйлдлийн түүх', 'хэрэглээ', 'холболт'] as const;
export const DELETE_DONE = 'Бүх өгөгдөл устлаа.';

/** The AI provider the server calls. Changing it makes every earlier consent ask again. */
export const AI_PROVIDER = 'openai';
/** The disclosure shown before any request may reach the AI (Section 8). */
export const AI_DISCLOSURE =
  'AI-г холбоход таны бичсэн хүсэлт болон өмнөх хүсэлтийн задаргаа Nomi сервер → OpenAI руу явна. Байршил, ажил, санамж, яриа явахгүй. OpenAI өгөгдлийг өөрийн нөхцөлөөр боловсруулна.';
export const WEB_TOKEN_LINE = 'Вэб дээр код хөтчийн хадгалалтад байна.';

/** The AsyncStorage calls this module needs; AsyncStorage itself on the device, a Map in tests. */
export type KeyValueStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  getAllKeys: () => Promise<readonly string[]>;
};
/** expo-secure-store on Android and iOS (storage-device.ts). The web has none: callers pass null and the token stays in browser storage. */
export type SecureStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  deleteItem: (key: string) => Promise<void>;
};

/** Reads a saved `nomi:pilot:v1`. Unknown fields are dropped; unparseable JSON throws so the caller can say so. */
export function readState(raw: string | null): LocalState {
  if (!raw) return { ...emptyState };
  const v = JSON.parse(raw);
  return {
    saved: Array.isArray(v.saved) ? v.saved.filter((x: unknown) => typeof x === 'string') : [],
    visits: v.visits && typeof v.visits === 'object' ? v.visits : {},
    apiUrl: typeof v.apiUrl === 'string' ? v.apiUrl : '',
    token: typeof v.token === 'string' ? v.token : '',
    ...(typeof v.onboardedAt === 'string' ? { onboardedAt: v.onboardedAt } : {}),
    ...(v.locationAsked === true ? { locationAsked: true } : {}),
    ...(typeof v.aiConsentAt === 'string' && Number.isFinite(Date.parse(v.aiConsentAt)) ? { aiConsentAt: v.aiConsentAt } : {}),
    ...(typeof v.aiConsentFor === 'string' ? { aiConsentFor: v.aiConsentFor } : {}),
    ...(typeof v.termsAcceptedAt === 'string' && Number.isFinite(Date.parse(v.termsAcceptedAt)) ? { termsAcceptedAt: v.termsAcceptedAt } : {}),
    ...(typeof v.termsVersion === 'string' ? { termsVersion: v.termsVersion } : {}),
  };
}

export const validToken = (token: string) => token.length >= TOKEN_MIN && token.length <= TOKEN_MAX && !/\s/.test(token);

/** The settings after the pairing form is saved. An empty URL unpairs: the token goes and so does the AI consent. */
export function withPairing(state: LocalState, apiUrl: string, token: string): LocalState {
  if (apiUrl) return { ...state, apiUrl, token };
  const { aiConsentAt, aiConsentFor, ...rest } = state;
  return { ...rest, apiUrl: '', token: '' };
}

/** "AI-г унтраах": requests are answered on the phone again until the disclosure is agreed to anew. */
export function withoutConsent(state: LocalState): LocalState {
  const { aiConsentAt, aiConsentFor, ...rest } = state;
  return rest;
}

export const withConsent = (state: LocalState, now = new Date()): LocalState => ({
  ...state,
  aiConsentAt: now.toISOString(),
  aiConsentFor: AI_PROVIDER,
});

/**
 * 'off': no server paired. 'consent': paired, but the user has not agreed to the current disclosure (none yet, or one naming an
 * earlier provider), so nothing is sent and requests are answered on the phone (AC 8.2). 'on': requests go to the server first.
 */
export function aiStatus(
  state: Pick<LocalState, 'apiUrl' | 'token' | 'aiConsentAt' | 'aiConsentFor'>
): 'off' | 'consent' | 'on' {
  if ((!state.apiUrl || !state.token) && !HOSTED_API_URL) return 'off';
  return state.aiConsentAt && state.aiConsentFor === AI_PROVIDER ? 'on' : 'consent';
}

/**
 * Loads and saves `nomi:pilot:v1`. With a secure store (Android, iOS) the token lives there under `nomi.pairing.token` and the
 * AsyncStorage copy is ''. The first load moves a token left in AsyncStorage by an older version across, and blanks it only once
 * the secure write succeeded. Without one (web) the token stays in the JSON. Saves run one after another.
 */
export function settingsStore(local: KeyValueStore, secure: SecureStore | null) {
  /** What the secure store holds, once known, so a save that did not touch the token does not rewrite it. */
  let saved: string | null = null;
  let pending: Promise<void> = Promise.resolve();
  const serialize = (state: LocalState) => JSON.stringify(secure ? { ...state, token: '' } : state);

  async function load(): Promise<LocalState> {
    const state = readState(await local.getItem(PILOT_KEY));
    if (!secure) return state;
    if (state.token) {
      try {
        await secure.setItem(TOKEN_KEY, state.token);
        saved = state.token;
        await local.setItem(PILOT_KEY, serialize(state));
      } catch {
        // The token stays where it was and the move is tried again on the next launch.
      }
      return state;
    }
    let token = '';
    try {
      token = (await secure.getItem(TOKEN_KEY)) ?? '';
      saved = token;
    } catch {
      // An unreadable keychain leaves the app unpaired until the next launch rather than blocking it.
    }
    // A token without a server (left in the iOS keychain by an earlier install, for instance) pairs nothing.
    return { ...state, token: state.apiUrl ? token : '' };
  }

  function save(state: LocalState): Promise<void> {
    pending = pending
      .catch(() => {})
      .then(async () => {
        if (secure && state.token !== saved) {
          if (state.token) await secure.setItem(TOKEN_KEY, state.token);
          else await secure.deleteItem(TOKEN_KEY);
          saved = state.token;
        }
        await local.setItem(PILOT_KEY, serialize(state));
      });
    return pending;
  }

  /** After "delete my data": the next save writes the token again, whatever it is. */
  function forget() {
    saved = null;
  }

  return { load, save, forget };
}

export type DeleteDeps = {
  local: Pick<KeyValueStore, 'getAllKeys' | 'removeItem'>;
  secure: SecureStore | null;
  /** Cancels every scheduled notification (the adapter's cancel-all included) and removes the reminder store: reminders-storage.ts. */
  deleteReminders: () => Promise<void>;
  /** Removes the pending follow-ups: followups-storage.ts. */
  deleteFollowups: () => Promise<void>;
};

/**
 * "Миний өгөгдлийг устгах" (Section 8): notifications are cancelled first so nothing fires for deleted data, then the follow-ups,
 * the secure token and every `nomi:` key go. Every step is tried even when one fails, so a retry only has the rest to do; any
 * failure rejects so the user is not told everything went when it did not.
 */
export async function deleteAllData(deps: DeleteDeps): Promise<void> {
  let failed = 0;
  const attempt = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch {
      failed++;
    }
  };
  await attempt(deps.deleteReminders);
  await attempt(deps.deleteFollowups);
  const secure = deps.secure;
  if (secure) await attempt(() => secure.deleteItem(TOKEN_KEY));
  if (secure) await attempt(() => secure.deleteItem(INSTALL_KEY));
  const keys = new Set<string>(NOMI_KEYS);
  await attempt(async () => {
    for (const key of await deps.local.getAllKeys()) if (key.startsWith('nomi:')) keys.add(key);
  });
  for (const key of keys) await attempt(() => deps.local.removeItem(key));
  if (failed) throw new Error('delete_incomplete');
}

/** The install key (install.ts): in SecureStore on Android and iOS, in browser storage on web. */
export function installKeyStore(local: KeyValueStore, secure: SecureStore | null) {
  return {
    get: () => (secure ? secure.getItem(INSTALL_KEY) : local.getItem(INSTALL_WEB_KEY)),
    set: (key: string) => (secure ? secure.setItem(INSTALL_KEY, key) : local.setItem(INSTALL_WEB_KEY, key)),
    clear: () => (secure ? secure.deleteItem(INSTALL_KEY) : local.removeItem(INSTALL_WEB_KEY)),
  };
}
