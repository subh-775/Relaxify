/**
 * The JS half of DeviceModule.kt: the data saver's view of the network, and
 * the words for Sunday's Recap notification.
 *
 * The notification is posted by Android with the app closed, so its line is
 * worked out here whenever the stats change and handed over ahead of time.
 */
import {DeviceEventEmitter, NativeModules} from 'react-native';
import {setOnCellular} from './store';
import {onStatsChange, readStats} from './stats';
import {buildRecap, recapEligible, reminderText} from './recap';

type DeviceNative = {
  watchNetwork?: () => Promise<boolean>;
  setRecapReminder?: (enabled: boolean, body: string) => void;
};

const native = (NativeModules.Device ?? {}) as DeviceNative;

let started = false;
let sent: string | null = null;

function pushReminder(): void {
  if (typeof native.setRecapReminder !== 'function') {
    return;
  }
  // No setting: it goes to anyone who allows notifications. '' sends
  // nothing: a new listener's first Sunday has nothing to recap.
  const stats = readStats();
  const body = recapEligible(stats)
    ? reminderText(buildRecap(stats, Date.now(), 'week'))
    : '';
  if (body === sent) {
    return;
  }
  sent = body;
  native.setRecapReminder(true, body);
}

export function startDevice(): void {
  if (started) {
    return;
  }
  started = true;
  if (typeof native.watchNetwork === 'function') {
    native.watchNetwork().then(setOnCellular, () => {});
    DeviceEventEmitter.addListener('mp.network', (v: boolean) => setOnCellular(!!v));
  }
  // Scheduled on every start as well (sent is null here), which is what
  // brings the alarm back after a reboot.
  pushReminder();
  onStatsChange(pushReminder);
}
