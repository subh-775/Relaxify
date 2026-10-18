/**
 * A small event log, mirrored to logcat.
 *
 * Builds are installed from a release tag and tested by people who cannot run
 * `adb logcat`, so "the equalizer does nothing" and "the update popup
 * sometimes doesn't appear" need the app to say what it tried and what came
 * back. A release build installs no React Native console, so console.log
 * would die silently; this goes through the native module instead, and
 * `adb logcat -s MPJS` shows every line.
 *
 * It used to keep the last 200 entries in memory as well, for an in-app
 * Diagnostics screen. That screen is gone, and nothing read the buffer.
 */
import {NativeModules} from 'react-native';

const nativeLog = (NativeModules?.Audio as {log?: (t: string, m: string) => void} | undefined)
  ?.log;

/** Record an event. Keep `msg` short — this is a log line, not a report. */
export function diag(tag: string, msg: string): void {
  // Best-effort: an older APK has no native `log`, and a logging call must
  // never be the thing that crashes the app.
  try {
    nativeLog?.(tag, msg);
  } catch {
    // ignore
  }
}
