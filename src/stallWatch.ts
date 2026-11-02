/**
 * Notices when the JavaScript thread freezes.
 *
 * Every tap, scroll handler and screen update runs on that one thread, so a
 * long piece of work there is the whole app "stuck". A timer asks to run
 * every TICK_MS; when it runs much later than that, the thread was busy for
 * the difference, and the stall is logged (diag, for logcat) and counted
 * (Analytics, rate-limited), with what the app was doing.
 *
 * Only while the app is in front: in the background Android holds timers
 * back on purpose, which would read as stalls that nobody saw.
 */
import {AppState} from 'react-native';
import {diag} from './diag';
import {logEvent} from './analytics';

const TICK_MS = 250;
/** Long enough for a person to feel it. */
const STALL_MS = 400;
/** One Analytics event per this long, at most. */
const REPORT_GAP_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let last = 0;
let lastReport = 0;
/** What the app started lately, so a stall can say what it was in. */
const recent: Array<[number, string]> = [];

/** Mark the start of a piece of work. A stall reports the marks made since
 *  the timer last ran: the work the thread was busy with. */
export function stallContext(label: string): void {
  recent.push([Date.now(), label]);
  if (recent.length > 40) {
    recent.shift();
  }
}

function start(): void {
  if (timer) {
    return;
  }
  last = Date.now();
  timer = setInterval(() => {
    const now = Date.now();
    const late = now - last - TICK_MS;
    const since = last;
    last = now;
    if (late < STALL_MS) {
      return;
    }
    const labels = [
      ...new Set(recent.filter(([t]) => t >= since - TICK_MS).map(([, l]) => l)),
    ];
    const where = labels.join(', ');
    diag('stall', `JS thread busy ${late}ms${where ? ` (${where})` : ''}`);
    if (now - lastReport > REPORT_GAP_MS) {
      lastReport = now;
      logEvent('js_stall', {ms: late, where: where || 'unknown'});
    }
  }, TICK_MS);
}

function stop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function watchStalls(): () => void {
  if (AppState.currentState === 'active') {
    start();
  }
  const sub = AppState.addEventListener('change', s =>
    s === 'active' ? start() : stop(),
  );
  return () => {
    sub.remove();
    stop();
  };
}
