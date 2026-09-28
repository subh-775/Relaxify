/**
 * One source of truth for the site's shape: six pages and Releases, each with
 * the colour its card wears everywhere (home stack, page banner, top chips).
 *
 * The colours are the app's own card palettes (src/brandArt.ts in the app), so
 * the site and the app are one set.
 */

/** owner/name once, so a rename or a fork is one edit rather than six. */
const SLUG = 'subh-775/Relaxify';

export const SITE = {
  name: 'Relaxify',
  slug: SLUG,
  repo: `https://github.com/${SLUG}`,
  releases: `https://github.com/${SLUG}/releases/latest`,
  allReleases: `https://github.com/${SLUG}/releases`,
  issues: `https://github.com/${SLUG}/issues`,
  api: `https://api.github.com/repos/${SLUG}`,
  apk: `https://github.com/${SLUG}/releases/latest/download/Relaxify.apk`,
  /** Where "Suggest an edit" points. The page path is appended. */
  editBase: `https://github.com/${SLUG}/edit/main/docs/content`,
};

/** A field, its ink, and three accents; the app's PALS. */
export const PAL = {
  coral: {bg: '#FF5A4E', ink: '#111014', a: '#B8FF3C', b: '#7A2CFF', c: '#3CC8FF'},
  lime: {bg: '#B8F03C', ink: '#111014', a: '#6C2BFF', b: '#FF5A4E', c: '#3CC8FF'},
  sky: {bg: '#3CB4FF', ink: '#111014', a: '#FFE14D', b: '#FF4FB3', c: '#B8FF3C'},
  lav: {bg: '#A9A3FF', ink: '#111014', a: '#FF7A1A', b: '#FF4FB3', c: '#FFE14D'},
  orange: {bg: '#FF9F1C', ink: '#111014', a: '#6C2BFF', b: '#3CC8FF', c: '#FF4FB3'},
  pink: {bg: '#FF6FD8', ink: '#111014', a: '#1FD1B5', b: '#FFE14D', c: '#6C2BFF'},
  teal: {bg: '#1FC3A6', ink: '#111014', a: '#FF5A4E', b: '#FFE14D', c: '#6C2BFF'},
  night: {bg: '#15121C', ink: '#FFFFFF', a: '#2EE6C8', b: '#FF3FA4', c: '#FFD23F'},
};

export const PAGES = [
  {
    link: '/start',
    pal: 'coral',
    art: 'burst',
    title: 'Start here',
    card: 'Your first song in a minute',
    read: '1 min',
  },
  {
    link: '/play',
    pal: 'lime',
    art: 'search',
    title: 'Play & find',
    card: 'Every song, one search',
    read: '3 min',
  },
  {
    link: '/music',
    pal: 'sky',
    art: 'stack',
    title: 'Your music',
    card: 'Keep it, move it, Recap it',
    read: '3 min',
  },
  {
    link: '/together',
    pal: 'lav',
    art: 'dots',
    title: 'Together',
    card: 'Same song, same second',
    read: '2 min',
  },
  {
    link: '/sound',
    pal: 'orange',
    art: 'bars',
    title: 'Sound',
    card: 'Make it sound yours',
    read: '2 min',
  },
  {
    link: '/help',
    pal: 'pink',
    art: 'ask',
    title: 'Help',
    card: 'Something off? Fix it here',
    read: '2 min',
  },
];

export const RELEASES = {
  link: '/releases',
  pal: 'night',
  art: 'note',
  title: 'Releases',
  card: 'Every version, straight from GitHub',
};

/** Every page in reading order, Releases last: what "next page" walks. */
export const FLAT = [...PAGES, RELEASES];

/**
 * The old site's addresses, forwarded to where their content lives now, so a
 * bookmark or a shared link still lands somewhere useful.
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
export const ROUTES = ['/', ...FLAT.map(p => p.link), ...Object.keys(MOVED)];
