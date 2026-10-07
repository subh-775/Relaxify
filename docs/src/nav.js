/**
 * One source of truth for the site's shape: the pages in reading order, each
 * with the card colour it wears (the app's own card palette) and what its
 * card on Home says.
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

/** The order colours cycle through for steps and gesture cards. */
export const CYCLE = ['lime', 'sky', 'lav', 'orange', 'pink', 'teal'];

export const PAGES = [
  {link: '/start', pal: 'coral', title: 'Start here', kicker: 'Your first song in a minute', card: 'Install, pick languages, hit play.'},
  {link: '/play', pal: 'lime', title: 'Play & find', kicker: 'Every song, one search', card: 'Search, the player, the right copy.'},
  {link: '/music', pal: 'sky', title: 'Your music', kicker: 'Keep it, move it, Recap it', card: 'Likes, downloads, playlists.'},
  {link: '/together', pal: 'lav', title: 'Together', kicker: 'Same song, same second', card: 'Jam with friends, share playlists.'},
  {link: '/sound', pal: 'orange', title: 'Sound', kicker: 'Make it sound yours', card: 'Equalizer, quality, data saver.'},
  {link: '/help', pal: 'pink', title: 'Help', kicker: "Something off? Let's fix it", card: 'Quick answers, no stress.', mood: 'huh'},
  {link: '/releases', pal: 'night', title: "What's new", kicker: 'Straight from GitHub, always fresh', card: 'The newest version, live.'},
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
  '/guide/downloads': '/music',
  '/guide/spotify-import': '/music',
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
