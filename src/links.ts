/** The addresses the app opens in the browser, in one place. */
export const DOCS_URL = 'https://subh-775.github.io/Relaxify/';
export const LICENCE_URL = 'https://www.gnu.org/licenses/gpl-3.0.html';
/** One link for every invite: the page's button always downloads the newest
 *  release (GitHub's releases/latest/download), so it never goes stale. */
export const GET_URL = `${DOCS_URL}get/`;

/** What "Recommend Relaxify" (and the Recap's share) sends: one line on what
 *  the app is, and the link that always installs the newest version. */
export function inviteMessage(
  lead = "I've been listening on Relaxify 🎧",
): string {
  return [
    lead,
    'A free music app for Android: search once, play from JioSaavn, ' +
      'SoundCloud and YouTube, listen together with Jam.',
    `Get it: ${GET_URL}`,
  ].join('\n');
}

/** A shared playlist as a link: opens it in the app, or offers the install. */
export function playlistLink(code: string): string {
  return `${DOCS_URL}p/?c=${code}`;
}

/** A new GitHub issue with the facts a report always needs filled in. */
export function reportUrl(version: string, phone: string, android: string): string {
  const body = [
    '**What happened?**',
    '',
    '',
    '**What did you expect?**',
    '',
    '',
    '---',
    `Relaxify ${version || '?'}, ${phone || 'unknown phone'}, Android ${android || '?'}`,
  ].join('\n');
  return `https://github.com/subh-775/Relaxify/issues/new?body=${encodeURIComponent(body)}`;
}
