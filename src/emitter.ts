/**
 * The listeners behind a module-level value that screens subscribe to.
 *
 * `subscribe` is one stable function on purpose: useSyncExternalStore
 * resubscribes whenever it is handed a new one, so the inline closure each store
 * used to write unsubscribed and resubscribed on every render, in every list row.
 */
export type Emitter = {
  subscribe: (listener: () => void) => () => void;
  emit: () => void;
};

export function createEmitter(): Emitter {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit() {
      listeners.forEach(l => l());
    },
  };
}
