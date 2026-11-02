/**
 * The Jam queue's order is its keys' order: Firebase's push keys sort by when
 * they were made. A song moves by taking a new key that sorts between its new
 * neighbours, so reordering needs no extra field, and the database rules,
 * which allow a queue item only `track` and `by`, stay as they are.
 */

/** Safe in a database key, in ascending character order. The two below "-"
 *  leave room in front of a push key, which starts with one. */
const DIGITS =
  '!+-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

/**
 * A key that sorts after `a` and before `b`. Either may be missing: no `a` is
 * the start of the queue, no `b` its end.
 *
 * A key never ends in the lowest digit, so there is always room in front of
 * it: moving songs to the top again and again keeps finding keys.
 */
export function keyBetween(a = '', b?: string): string {
  if (b !== undefined && a >= b) {
    throw new Error(`no key between ${a} and ${b}`);
  }
  const lowest = DIGITS[0];
  let out = '';
  // While `out` still equals the start of `a` (or of `b`), that key still
  // bounds the next character.
  let underA = true;
  let underB = b !== undefined;
  for (let i = 0; ; i++) {
    const lo = underA && i < a.length ? a.charCodeAt(i) : -1;
    const hi = underB && i < b!.length ? b!.charCodeAt(i) : 0x10000;
    const room = [...DIGITS].filter(c => {
      const code = c.charCodeAt(0);
      return code > lo && code < hi && c !== lowest;
    });
    if (room.length) {
      // The middle of the room, not its edge, so later moves keep room too.
      return out + room[Math.floor(room.length / 2)];
    }
    const c = underA && i < a.length ? a[i] : lowest;
    out += c;
    if (underB && c.charCodeAt(0) < hi) {
      underB = false;
    }
    if (underA && (i >= a.length || c.charCodeAt(0) > lo)) {
      underA = false;
    }
  }
}

/** The key the song at `from` takes to end up at `to`. */
export function movedKey(keys: string[], from: number, to: number): string {
  const rest = keys.filter((_, i) => i !== from);
  return keyBetween(rest[to - 1], rest[to]);
}
