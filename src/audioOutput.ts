/**
 * Where the sound is actually going — "OnePlus Nord Buds 2r", or nothing when
 * it's the phone's own speaker.
 *
 * Android is the only one that knows this, so it comes from the native side.
 * The method may be absent on an older build, in which case this reports null
 * and every caller simply renders nothing — no crash, no empty label.
 */
import {useEffect, useState} from 'react';
import {AppState, DeviceEventEmitter, NativeModules} from 'react-native';

type AudioNative = {getAudioOutput?: () => Promise<string | null>};

const native = (NativeModules.Audio ?? {}) as AudioNative;

export async function getAudioOutput(): Promise<string | null> {
  if (typeof native.getAudioOutput !== 'function') {
    return null;
  }
  try {
    return await native.getAudioOutput();
  } catch {
    return null;
  }
}

/**
 * The current output device, re-read when Android says one came or went
 * (AudioModule's "mp.audio.devices", the event headphone memory uses) and
 * when the app comes back to the foreground.
 *
 * It used to poll every 1.5 s for as long as a player was on screen, which
 * woke JS all session long for an event that happens a few times a day.
 * Switching between two paired headsets fires the same event, so the name
 * still updates while you look at it.
 *
 * ONE reader for every caller (the mini player, the full player and the
 * queue all show the name).
 */
let current: string | null = null;
const subscribers = new Set<(name: string | null) => void>();

function tick() {
  if (!subscribers.size) {
    return;
  }
  getAudioOutput().then(v => {
    current = v;
    subscribers.forEach(s => s(v));
  });
}

AppState.addEventListener('change', s => {
  if (s === 'active') {
    tick();
  }
});
// A device turns up a beat before Android routes audio to it.
DeviceEventEmitter.addListener('mp.audio.devices', () => setTimeout(tick, 400));

export function useAudioOutput(): string | null {
  const [name, setName] = useState(current);

  useEffect(() => {
    subscribers.add(setName);
    tick();
    return () => {
      subscribers.delete(setName);
    };
  }, []);

  return name;
}
