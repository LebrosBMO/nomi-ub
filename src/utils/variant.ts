/**
 * Which of the two apps this build is (app.config.ts). The customer app is the chat; the owner app ("Nomi бизнес") opens on
 * the business pages instead, and ships without the location and notification parts. Both talk to the same server, so they
 * share one database.
 *
 * EXPO_PUBLIC_APP_VARIANT rather than the app config, because only EXPO_PUBLIC_ variables are compiled into the bundle the
 * phone runs; `extra` is read by the build, not by the app.
 */
export const IS_BUSINESS_APP = process.env.EXPO_PUBLIC_APP_VARIANT === 'business';
