/** The addresses the app opens in the browser, in one place. */
export const DOCS_URL = 'https://subh-775.github.io/Relaxify/';
export const LICENCE_URL = 'https://www.gnu.org/licenses/gpl-3.0.html';

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
