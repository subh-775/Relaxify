/**
 * One source of truth for the site's shape: the pages in reading order (the
 * four core features first), the colour each one's card wears on Home, and
 * what that card says. Colour lives on Home only; the pages are plain.
 */

/** owner/name once, so a rename or a fork is one edit rather than six. */
const SLUG = 'subh-775/Relaxify';

export const SITE = {
  name: 'Relaxify',
  slug: SLUG,
  repo: `https://github.com/${SLUG}`,
  allReleases: `https://github.com/${SLUG}/releases`,
  issues: `https://github.com/${SLUG}/issues`,
  api: `https://api.github.com/repos/${SLUG}`,
  /** Always the newest release's app file. */
  apk: `https://github.com/${SLUG}/releases/latest/download/Relaxify.apk`,
  /** Where "Suggest a change" points. The page path is appended. */
  editBase: `https://github.com/${SLUG}/edit/main/docs/content`,
};

/** A card field, its ink, and the colour of its sticker. */
export const PAL = {
  coral: {bg: '#FF5A4E', ink: '#111014', art: '#B8FF3C'},
  lime: {bg: '#B8F03C', ink: '#111014', art: '#7A2CFF'},
  sky: {bg: '#3CB4FF', ink: '#111014', art: '#FFE14D'},
  lav: {bg: '#A9A3FF', ink: '#111014', art: '#FF4FB3'},
  orange: {bg: '#FF9F1C', ink: '#111014', art: '#3CC8FF'},
  pink: {bg: '#FF6FD8', ink: '#111014', art: '#1FD1B5'},
  teal: {bg: '#1FC3A6', ink: '#111014', art: '#FFE14D'},
  night: {bg: '#15121C', ink: '#FFFFFF', art: '#2EE6C8'},
};

export const PAGES = [
  {link: '/start', pal: 'coral', title: 'Getting started', kicker: 'Install and first steps', card: 'From download to your first song in about a minute.'},
  {link: '/offline', pal: 'lime', title: 'Offline listening', kicker: 'No signal, no problem', card: 'Download songs and play them anywhere, no data needed.'},
  {link: '/import', pal: 'sky', title: 'Bring your playlists', kicker: 'From Spotify and YouTube', card: 'Paste a link and your playlist is rebuilt here.'},
  {link: '/sound', pal: 'orange', title: 'Equalizer and sound', kicker: 'Hear more of what you love', card: 'Bring out the bass, the voice or the guitar.'},
  {link: '/together', pal: 'lav', title: 'Listen together', kicker: 'Same song, same second', card: 'Start a Jam with friends, or share a playlist.'},
  {link: '/play', pal: 'pink', title: 'Search and play', kicker: 'Every source, one search', card: 'Search, lyrics and picking the right version.'},
  {link: '/music', pal: 'teal', title: 'Your library', kicker: 'Likes, playlists and Recap', card: 'Everything you keep, and your week in music.'},
  {link: '/help', pal: 'coral', title: 'Questions and fixes', kicker: 'Answers to common questions', card: 'Installing, playback and your data.'},
  {link: '/releases', pal: 'night', title: "What's new", kicker: 'The latest version', card: 'Version, date and downloads.'},
];

/** The download page lives outside the app shell (public/get), so links to
 *  it load it as a page of its own. */
export const GET_PAGE = '/get/';

/**
 * Older addresses, forwarded to where their content lives now, so a bookmark
 * or a shared link still lands somewhere useful.
 */
export const MOVED = {
  '/guide/introduction': '/start',
  '/guide/installation': '/start',
  '/guide/quick-start': '/start',
  '/guide/finding-music': '/play',
  '/guide/player': '/play',
  '/guide/gestures': '/play',
  '/guide/queue': '/play',
  '/guide/lyrics': '/play',
  '/guide/library': '/music',
  '/guide/downloads': '/offline',
  '/guide/spotify-import': '/import',
  '/guide/recap': '/music',
  '/guide/jam': '/together',
  '/guide/equalizer': '/sound',
  '/reference/sound': '/sound',
  '/reference/settings': '/help',
  '/reference/updates': '/help',
  '/reference/architecture': '/help',
  '/reference/troubleshooting': '/help',
  '/fair-use': '/help',
  '/licence': '/help',
};

/** Every route the site serves. The build emits a real HTML file for each,
 *  old addresses included, so deep links are 200s rather than a 404 page. */
export const ROUTES = ['/', ...PAGES.map(p => p.link), ...Object.keys(MOVED)];
