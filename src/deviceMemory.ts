/**
 * Headphone memory: every output device keeps its own equalizer, and music
 * can carry on the moment headphones connect.
 *
 * A profile is the three EQ settings, saved under the device's name (the same
 * name the mini player shows; the phone's speaker is "speaker"). Changing the
 * EQ saves it to whatever is playing now; switching device puts that device's
 * profile back. A device heard for the first time simply keeps the EQ you
 * already had, which then becomes its own the next time you change it.
 *
 * Driven by AudioModule's "mp.audio.devices" event, a native event, so a pair
 * of earbuds connecting with the screen off still switches the EQ.
 */
import {DeviceEventEmitter} from 'react-native';
import {getAudioOutput} from './audioOutput';
import {applyAudioEffects} from './audioEffects';
import {onSettingsChange, readSettings, writeSettings, type Settings} from './store';
import {createStore} from './storage';
import {State, TrackPlayer} from './player';

type Profile = Pick<Settings, 'eqEnabled' | 'eqPreset' | 'eqGains'>;

/** Bounded like every other store; more devices than this is not a person. */
const MAX = 30;

const profiles = createStore<Record<string, Profile>>(
  'mp.deviceEq.v1',
  {},
  raw =>
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, Profile>)
      : {},
);

const keyOf = (name: string | null) => (name ? name.trim() : 'speaker');

let current = '';
let started = false;
/** Set while a loaded profile is being written, so it is not saved back. */
let loading = false;

function snapshot(s: Settings): Profile {
  return {eqEnabled: s.eqEnabled, eqPreset: s.eqPreset, eqGains: s.eqGains};
}

function sameProfile(a: Profile | undefined, b: Profile): boolean {
  return (
    !!a &&
    a.eqEnabled === b.eqEnabled &&
    a.eqPreset === b.eqPreset &&
    JSON.stringify(a.eqGains) === JSON.stringify(b.eqGains)
  );
}

/** Save the EQ as it is now under the device playing now. */
function remember(): void {
  const s = readSettings();
  if (loading || !current || !s.deviceMemory) {
    return;
  }
  const p = snapshot(s);
  if (sameProfile(profiles.get()[current], p)) {
    return;
  }
  profiles.update(all => {
    const next = {...all, [current]: p};
    const keys = Object.keys(next);
    return keys.length > MAX
      ? Object.fromEntries(keys.slice(-MAX).map(k => [k, next[k]]))
      : next;
  });
}

/** The output changed: switch to that device's EQ, if it has one. */
async function switched(added: boolean, headset: boolean): Promise<void> {
  const key = keyOf(await getAudioOutput());
  const s = readSettings();
  if (key !== current) {
    current = key;
    const saved = profiles.get()[key];
    if (s.deviceMemory && saved && !sameProfile(saved, snapshot(s))) {
      loading = true;
      writeSettings(saved);
      loading = false;
      applyAudioEffects().catch(() => {});
    }
  }
  if (added && headset && s.resumeOnConnect) {
    try {
      const {state} = await TrackPlayer.getPlaybackState();
      const track = await TrackPlayer.getActiveTrack();
      if (track && (state === State.Paused || state === State.Ready)) {
        await TrackPlayer.play();
      }
    } catch {
      // The engine is not up yet; nothing to resume.
    }
  }
}

/** Once, at start-up. Also starts the native device watch. */
export function startDeviceMemory(): void {
  if (started) {
    return;
  }
  started = true;
  getAudioOutput()
    .then(name => {
      current = keyOf(name);
      remember();
    })
    .catch(() => {});
  onSettingsChange(remember);
  DeviceEventEmitter.addListener(
    'mp.audio.devices',
    (e: {added?: boolean; headset?: boolean}) => {
      switched(!!e?.added, !!e?.headset).catch(() => {});
    },
  );
}

/** Which device the EQ is being saved to, for the Equalizer screen. */
export function currentDevice(): string {
  return current === 'speaker' ? 'this phone' : current;
}
