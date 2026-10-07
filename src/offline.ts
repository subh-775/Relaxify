/**
 * Is the phone offline?
 *
 * Asked of the engine (/api/connectivity reaches two well-known hosts), and
 * only after something failed to load — then every few seconds while the
 * answer is yes, so Home and Search come back by themselves.
 */
import {useSyncExternalStore} from 'react';
import {apiGet} from './backend';

let offline = false;
const listeners = new Set<() => void>();
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
  listeners.forEach(l => l());
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

export function useOffline(): boolean {
  return useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => offline,
  );
}
