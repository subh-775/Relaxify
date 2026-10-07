/**
 * One source of truth for the site's shape: the pages, in reading order,
 * grouped the way the sidebar shows them.
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
  /** Always the newest release's app file. */
  apk: `https://github.com/${SLUG}/releases/latest/download/Relaxify.apk`,
  /** Where "Suggest an edit" points. The page path is appended. */
  editBase: `https://github.com/${SLUG}/edit/main/docs/content`,
};

/** Each page: its address, its name in the menu, and one line on what it
 *  answers (shown under the page title and on the home page). */
export const GROUPS = [
  {
    title: 'Get going',
    pages: [
      {link: '/start', title: 'Start here', line: 'Install Relaxify, play your first song and find your way around.'},
    ],
  },
  {
    title: 'Using Relaxify',
    pages: [
      {link: '/play', title: 'Play and find', line: 'Search, the player and its gestures, lyrics, and the right copy of a song.'},
      {link: '/music', title: 'Your music', line: 'Likes, playlists, downloads, bringing playlists over, and your Recap.'},
      {link: '/together', title: 'Listen together', line: 'Jam with friends, share playlists, and tell a friend about the app.'},
      {link: '/sound', title: 'Sound', line: 'The equalizer, crossfade, streaming quality and saving mobile data.'},
    ],
  },
  {
    title: 'Help',
    pages: [
      {link: '/help', title: 'Questions and fixes', line: 'When something does not work as you expect, the answer is probably here.'},
      {link: '/releases', title: "What's new", line: 'The newest version and what changed in it.'},
    ],
  },
];

/** Every page in reading order: what "next page" walks. */
export const FLAT = GROUPS.flatMap(g => g.pages);

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
export const ROUTES = ['/', ...FLAT.map(p => p.link), ...Object.keys(MOVED)];
