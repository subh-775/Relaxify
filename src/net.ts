/**
 * fetch, abandoned after a while.
 *
 * React Native's fetch has no timeout of its own: a request to a server that
 * accepted the connection and never answered never settles. The engine's
 * calls (backend.ts) were the only ones guarded; the Jam's database calls, the
 * engine's start-up check and the doodle manifest could each hang for good —
 * a Jam stuck until the app was restarted, a launch that never finished.
 */
export async function timedFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, {...init, signal: ctl.signal});
  } finally {
    clearTimeout(timer);
  }
}
