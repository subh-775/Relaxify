/**
 * Global toasts.
 *
 * Any module can call toast('…') without holding a component reference; the
 * <Toaster /> mounted once in App renders them. Messages show ONE AT A TIME and
 * queue, so three quick actions read as three confirmations in sequence instead
 * of piling on top of each other.
 *
 * The WebView version rode on a window CustomEvent; React Native has no window,
 * so the transport is a module-level store instead. Same behaviour.
 */
import {useSyncExternalStore} from 'react';

/** 'info' is the everyday confirmation bar; 'warn' is visually distinct (dark,
 *  accent-bordered) for system-ish notices like "press back again to exit". */
export type ToastKind = 'info' | 'warn';
/** One button on the toast, such as Undo. */
export type ToastAction = {label: string; onPress: () => void};
type Extra = {
  /** A song's cover: the toast shows it and takes its colour. */
  art?: string | null;
  action?: ToastAction;
};
export type ToastItem = {id: number; message: string; kind: ToastKind} & Extra;

const SHOW_MS = 2200;
/** Long enough to reach for Undo. */
const ACTION_MS = 3800;
const GAP_MS = 180;

let current: ToastItem | null = null;
let nextId = 0;
const queue: Array<{message: string; kind: ToastKind} & Extra> = [];
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  listeners.forEach(l => l());
}

function pump() {
  const item = queue.shift();
  if (item === undefined) {
    current = null;
    timer = null;
    emit();
    return;
  }
  current = {id: ++nextId, ...item};
  emit();
  timer = setTimeout(() => {
    current = null;
    emit();
    timer = setTimeout(pump, GAP_MS);
  }, current.action ? ACTION_MS : SHOW_MS);
}

/** Tapping the action runs it and clears the toast straight away. */
export function runToastAction(): void {
  const a = current?.action;
  if (!a) {
    return;
  }
  if (timer) {
    clearTimeout(timer);
  }
  current = null;
  emit();
  timer = setTimeout(pump, GAP_MS);
  a.onPress();
}

export function toast(message: string, kind: ToastKind = 'info', extra: Extra = {}): void {
  if (!message) {
    return;
  }
  queue.push({message: String(message), kind, ...extra});
  if (!timer) {
    pump();
  }
}

export function useToast(): ToastItem | null {
  return useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
