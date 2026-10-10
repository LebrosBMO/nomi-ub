import { Platform } from 'react-native';

/**
 * The owner's own report link, kept in this browser. Once they have opened the link Nomi sent them, the icon on their home
 * screen opens their own numbers instead of the search. Only this browser ever holds it: the server stores nothing about
 * who is reading a report, and the link expires on its own.
 */
const KEY = 'nomi:business:v1';
export type RememberedReport = { token: string; placeId: string; name: string | null };

const storage = () => (Platform.OS === 'web' && typeof localStorage !== 'undefined' ? localStorage : null);

export function rememberReport(report: RememberedReport) {
  try {
    storage()?.setItem(KEY, JSON.stringify(report));
  } catch {
    // A browser with storage switched off simply asks for the link again next time.
  }
}

export function rememberedReport(): RememberedReport | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return typeof value?.token === 'string' && typeof value?.placeId === 'string' ? { token: value.token, placeId: value.placeId, name: value.name ?? null } : null;
  } catch {
    return null;
  }
}

export function forgetReport() {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // Nothing to do: the next read fails the same way and the page asks for the link again.
  }
}
