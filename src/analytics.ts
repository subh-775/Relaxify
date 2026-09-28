/**
 * Usage statistics: the app's own events, sent through Firebase by
 * AnalyticsModule.kt. Firebase adds active users, sessions, app version and
 * country/city by itself.
 *
 * Fire-and-forget: Firebase queues events on the phone and uploads them in
 * batches, so a call here costs one bridge message and never waits on the
 * network. A build without a Firebase config (see AnalyticsModule.kt) has
 * the module but drops everything.
 */
import {NativeModules} from 'react-native';
import type {Track} from './backend';

/** What is collected, in the words the app shows people: once as a notice,
 *  and always in Settings ("What we collect"). There is no switch; this is the
 *  disclosure. The list and the promise are shared, so the two cannot drift. */
export const COLLECTED_ITEMS =
  'songs played and how long you listened, searches, likes, playlists and ' +
  'downloads, settings you change, errors, the app version, your phone model ' +
  'and your approximate location (country and city)';
export const COLLECTED_PROMISE =
  'They are linked to an anonymous ID for this phone, never to your name, ' +
  'account or contacts.';
/** The one thing beyond statistics that leaves the phone, and only in a Jam. */
export const JAM_NOTE =
  'During a Jam, the song, where it is, the Jam queue and the names you enter ' +
  'are shared through our database so the phones can follow each other. They ' +
  'are deleted when the Jam ends.';
export const ANALYTICS_NOTE = `Relaxify sends usage statistics to help improve the app: ${COLLECTED_ITEMS}. ${COLLECTED_PROMISE}`;

type AnalyticsNative = {
  log?: (name: string, params: Record<string, string | number>) => void;
  recordError?: (message: string, stack: string) => void;
};

const native = (NativeModules.Analytics ?? {}) as AnalyticsNative;

/**
 * The same event twice within this window is one action, not two. Measured on
 * a phone: starting a song fires the player's track-changed twice (0.3-0.8s
 * apart), and a re-tapped tab or a double-submitted search did the same, so
 * plays, searches and screens were all counted double.
 */
const REPEAT_MS = 2000;
let last = {key: '', at: 0};

export function logEvent(
  name: string,
  params: Record<string, string | number> = {},
): void {
  const key = name + JSON.stringify(params);
  const now = Date.now();
  if (key === last.key && now - last.at < REPEAT_MS) {
    return;
  }
  last = {key, at: now};
  try {
    native.log?.(name, params);
  } catch {}
}

/** A song, as event parameters. */
export function songParams(t: Track): Record<string, string> {
  return {
    title: String(t.title ?? ''),
    artist: String(t.artist ?? ''),
    source: String(t.primary_source ?? t.playable_source ?? ''),
  };
}

/** One error: counted as an `app_error` event, and, when the app survives it,
 *  sent to Crashlytics with its stack. A fatal one is left to Crashlytics'
 *  native crash report, which React Native's crash produces anyway. */
function report(e: unknown, fatal: boolean): void {
  const message = String((e as Error)?.message ?? e);
  logEvent('app_error', {message, fatal: fatal ? 1 : 0});
  if (!fatal) {
    try {
      native.recordError?.(message, String((e as Error)?.stack ?? ''));
    } catch {}
  }
}

/**
 * JS errors that reach the top, reported (see `report`) and then passed on to
 * the handler that was already there (the red box in debug, the crash in
 * release). And, in release, promise rejections nothing handled: an async
 * failure otherwise vanished without a trace. Installed once at startup.
 */
export function reportErrors(): void {
  const eu = (global as any).ErrorUtils;
  if (eu?.getGlobalHandler) {
    const previous = eu.getGlobalHandler();
    eu.setGlobalHandler((e: unknown, fatal?: boolean) => {
      report(e, !!fatal);
      previous?.(e, fatal);
    });
  }
  // Release only: in debug React Native installs its own tracker, which shows
  // the warning a developer needs, and this would replace it.
  if (!__DEV__) {
    (global as any).HermesInternal?.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (_id: number, e: unknown) => report(e, false),
    });
  }
}
