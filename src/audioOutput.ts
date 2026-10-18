/**
 * Where the sound is actually going — "Subh's realme Buds Air8", or nothing
 * when it's the phone's own speaker.
 *
 * Android is the only one that knows this, so it comes from the native side.
 * The method may be absent on an older build, in which case this reports null
 * and every caller simply renders nothing — no crash, no empty label.
 *
 * The name is the one you gave your headphones in Bluetooth settings when
 * Android lets the app read it: that needs Nearby devices on Android 12 and
 * up, asked once, the first time Bluetooth headphones are in use with the app
 * open. Refused, the headphones' model name shows, and it is not asked again.
 */
import {useEffect, useState} from 'react';
import {
  AppState,
  DeviceEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import {createStore} from './storage';

type Output = {name: string; model: string; bluetooth: boolean};
type AudioNative = {getAudioOutput?: () => Promise<Output | null>};

const native = (NativeModules.Audio ?? {}) as AudioNative;

async function readOutput(): Promise<Output | null> {
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
 * The output's model ("realme Buds Air8"), or null for the phone's speaker.
 * Headphone memory is keyed by this, not by the shown name: that one changes
 * when the headphones are renamed, or when Nearby devices is granted, and a
 * pair would lose its equalizer.
 */
export async function getOutputModel(): Promise<string | null> {
  return (await readOutput())?.model || null;
}

/** Nearby devices has been asked for: once, ever, whatever the answer. */
const askedForNames = createStore<boolean>(
  'mp.bluetoothNamesAsked.v1',
  false,
  raw => raw === true,
);

function askForNames(): void {
  if (
    askedForNames.get() ||
    Platform.OS !== 'android' ||
    Number(Platform.Version) < 31 ||
    AppState.currentState !== 'active'
  ) {
    return;
  }
  askedForNames.set(true);
  PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT)
    .then(r => {
      if (r === PermissionsAndroid.RESULTS.GRANTED) {
        tick();
      }
    })
    .catch(() => {});
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
  readOutput().then(out => {
    const v = out?.name || null;
    current = v;
    subscribers.forEach(s => s(v));
    if (out?.bluetooth) {
      askForNames();
    }
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
