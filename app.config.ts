import type { ExpoConfig } from 'expo/config';

import app from './app.json';

/**
 * Two apps out of one codebase, sharing one database.
 *
 *   npx expo start                                   → Nomi, the customer app (the chat)
 *   EXPO_PUBLIC_APP_VARIANT=business npx expo start  → Nomi бизнес, the owner app
 *
 * They are separate apps in the stores — their own name, icon and application id — so a shop owner installs the owner app and
 * never sees the chat. Both talk to the same server (src/app/api) and therefore the same Supabase database: a correction sent
 * from the owner app lands in the same `claims` table the web page writes to, and the counts the customer app sends are the
 * numbers the owner app reports.
 *
 * The owner app needs its own EAS project, since EAS keys a project by slug. Once:
 *   EXPO_PUBLIC_APP_VARIANT=business npx eas-cli init
 * then keep the id it prints in EAS_PROJECT_ID_BUSINESS (docs/play-store.md).
 */
const base = app.expo;
// EXPO_PUBLIC_, so the same one variable also reaches the app itself (src/utils/variant.ts).
const business = process.env.EXPO_PUBLIC_APP_VARIANT === 'business';
const projectId = business ? process.env.EAS_PROJECT_ID_BUSINESS || '' : base.extra.eas.projectId;

const config: ExpoConfig = {
  ...(base as unknown as ExpoConfig),
  name: business ? 'Nomi бизнес' : 'Nomi',
  slug: business ? 'nomi-business' : 'nomi',
  scheme: business ? 'nomibusiness' : 'nomi',
  icon: business ? './assets/images/icon-business.png' : base.icon,
  ios: { ...base.ios, bundleIdentifier: business ? 'mn.nomi.business' : base.ios.bundleIdentifier },
  android: {
    ...base.android,
    package: business ? 'mn.nomi.business' : base.android.package,
    adaptiveIcon: { ...base.android.adaptiveIcon, foregroundImage: business ? './assets/images/android-icon-business.png' : base.android.adaptiveIcon.foregroundImage },
  },
  // The owner app never asks for a position and never posts a notification, so it ships without those native parts.
  plugins: (business ? base.plugins.filter((p) => !/expo-(location|notifications)/.test(String(Array.isArray(p) ? p[0] : p))) : base.plugins) as ExpoConfig['plugins'],
  extra: { ...base.extra, eas: { projectId }, business },
  ...(projectId ? { updates: { url: `https://u.expo.dev/${projectId}` } } : { updates: undefined }),
};

export default config;
