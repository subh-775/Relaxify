/**
 * A light tap under the finger, for the moments a hand should feel: a like,
 * a long press that opened a menu, a swipe that queued a song, play/pause.
 *
 * Android's own touch feedback (DeviceModule.haptic): it follows the phone's
 * "Touch feedback" setting, so there is no switch for it here. Fire and
 * forget; an APK without the method simply stays still.
 */
import {NativeModules} from 'react-native';

export type HapticKind = 'tick' | 'confirm' | 'press';

const native = (NativeModules.Device ?? {}) as {
  haptic?: (kind: HapticKind) => void;
};

export function haptic(kind: HapticKind = 'tick'): void {
  try {
    native.haptic?.(kind);
  } catch {}
}
