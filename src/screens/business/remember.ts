import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The owner's own report link, kept on this device. Once they have opened the link Nomi sent them, the owner app — and the
 * web page on the same browser — opens their own numbers instead of the search. It never leaves the device: the server
 * stores nothing about who reads a report, and the link expires on its own.
 */
const KEY = 'nomi:business:v1';
export type RememberedReport = { token: string; placeId: string; name: string | null };

export async function rememberReport(report: RememberedReport) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(report));
  } catch {
    // Storage switched off only costs the shortcut: the owner opens their link again.
  }
}

export async function rememberedReport(): Promise<RememberedReport | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return typeof value?.token === 'string' && typeof value?.placeId === 'string' ? { token: value.token, placeId: value.placeId, name: value.name ?? null } : null;
  } catch {
    return null;
  }
}

export async function forgetReport() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // The next read fails the same way and the page asks for the link again.
  }
}
