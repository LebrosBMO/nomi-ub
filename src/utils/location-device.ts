import * as Location from 'expo-location';

import { POSITION_TIMEOUT_MS, withTimeout, type Coordinates } from './location';

/**
 * The system's standing answer, read without any prompt: 'granted', 'blocked' when it was refused and cannot be asked again,
 * otherwise 'unknown' (never asked, refused but askable, or a browser without the Permissions API).
 */
export async function permissionState(): Promise<'granted' | 'blocked' | 'unknown'> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.granted) return 'granted';
    return permission.status === Location.PermissionStatus.DENIED && !permission.canAskAgain ? 'blocked' : 'unknown';
  } catch {
    return 'unknown';
  }
}

export type LocateResult = { granted: boolean; coords: Coordinates | null };

/** A position the phone already holds is used when it is this recent and this precise: instant, and indoors a fresh fix often misses the limit. */
const RECENT_MS = 5 * 60_000;
const RECENT_ACCURACY_M = 500;

/**
 * One foreground fix: the system prompt if it has not been answered yet, then the phone's last known position when it is under
 * 5 minutes old and within 500 m, otherwise a fresh Balanced-accuracy position with a 10 s limit.
 * Only ever reached after the user's "Зөвшөөрөх" in chat (or a later nearby search in a session that allowed it). Background
 * location is never requested. The coordinates are returned to the search and kept nowhere; a refusal or a slow fix gives null.
 */
export async function locateOnce(): Promise<LocateResult> {
  let granted = false;
  try {
    granted = (await Location.requestForegroundPermissionsAsync()).granted;
    if (!granted) return { granted, coords: null };
    const recent = await Location.getLastKnownPositionAsync({ maxAge: RECENT_MS, requiredAccuracy: RECENT_ACCURACY_M }).catch(() => null);
    if (recent) return { granted, coords: { latitude: recent.coords.latitude, longitude: recent.coords.longitude } };
    const { coords } = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), POSITION_TIMEOUT_MS);
    return { granted, coords: { latitude: coords.latitude, longitude: coords.longitude } };
  } catch {
    return { granted, coords: null };
  }
}
