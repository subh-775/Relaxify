/**
 * Is the phone offline?
 *
 * Android says the moment the network goes (device.ts hands that to
 * noteNetwork), so the app knows before anything has failed. A network that is
 * there can still have no internet behind it, so that case is asked of the
 * engine (/api/connectivity reaches two well-known hosts): after something
 * failed to load, whenever Android reports a network, then every few seconds
 * while the answer is yes, so Home and Search come back by themselves.
 */
import {useSyncExternalStore} from 'react';
import {apiGet} from './backend';
import {createEmitter} from './emitter';

let offline = false;
const changes = createEmitter();
let poll: ReturnType<typeof setInterval> | null = null;

function setOffline(v: boolean): void {
  if (v === offline) {
    return;
  }
  offline = v;
  if (v && !poll) {
    poll = setInterval(() => checkOnline().catch(() => {}), 5000);
  } else if (!v && poll) {
    clearInterval(poll);
    poll = null;
  }
  changes.emit();
}

/** Ask now; true when online. An engine that does not answer is not
 *  "offline" — that is its own error, shown where it happened. */
export async function checkOnline(): Promise<boolean> {
  try {
    const r = await apiGet<{online?: boolean}>('/connectivity', 12000);
    setOffline(r.online === false);
  } catch {}
  return !offline;
}

/** Android's word on the network. Its absence settles it; its presence is only
 *  worth a check. */
export function noteNetwork(up: boolean): void {
  if (up) {
    checkOnline().catch(() => {});
  } else {
    setOffline(true);
  }
}

export function isOffline(): boolean {
  return offline;
}

export function useOffline(): boolean {
  return useSyncExternalStore(
    changes.subscribe,
    () => offline,
  );
}
