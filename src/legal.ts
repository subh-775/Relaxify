/**
 * Relaxify's Terms of Use and Privacy statement, and the credits.
 *
 * The ONE copy: the app shows it in Settings > About and support (LegalScreen),
 * and the docs site renders the same text at /terms and /privacy by importing
 * this file. Plain strings only, and no React Native imports, so the docs'
 * build can load it too.
 *
 * `**bold**` inside a string is the only markup; both renderers understand it.
 */

/** What is collected, in the words the app shows people: once as a notice,
 *  in Settings ("What we collect"), and in the Privacy statement. There is no
 *  switch; this is the disclosure. */
export const COLLECTED_ITEMS =
  'songs played and how long you listened, searches, likes, playlists and ' +
  'downloads, which features you use, whether lyrics were found for a song, ' +
  'settings you change, errors, the app version, your phone model and your ' +
  'approximate location (country and city)';
export const COLLECTED_PROMISE =
  'They are linked to an anonymous ID for this phone, never to your name, ' +
  'account or contacts.';
/** The one thing beyond statistics that leaves the phone, and only in a Jam. */
export const JAM_NOTE =
  'During a Jam, the song, where it is, the Jam queue and the names you enter ' +
  'are shared through our database so the phones can follow each other. They ' +
  'are deleted when the Jam ends.';
/** And when you share a playlist. */
export const SHARE_NOTE =
  'When you share a playlist, its name, its songs and the name you share it ' +
  "under (your phone's name, unless you type another) are kept in our " +
  "database for anyone who has its link, and the link's page shows the " +
  "playlist's name, until you delete the playlist.";

/** The music services Relaxify plays from, credited wherever the terms are. */
export const SOURCES = ['JioSaavn', 'SoundCloud', 'YouTube'] as const;

export const LEGAL_UPDATED = '8 October 2026';

export type LegalSection = {heading: string; paras?: string[]; list?: string[]};
export type LegalDoc = {
  key: 'terms' | 'privacy';
  title: string;
  intro: string;
  sections: LegalSection[];
};

const CONTACT =
  'Questions about these terms or your data: open an issue at ' +
  '**github.com/subh-775/Relaxify/issues**.';

export const TERMS: LegalDoc = {
  key: 'terms',
  title: 'Terms of Use',
  intro:
    'These terms apply to the Relaxify app for Android and its documentation. ' +
    'By installing or using Relaxify, you agree to them.',
  sections: [
    {
      heading: '1. What Relaxify is',
      paras: [
        'Relaxify is a free, open-source music player, made by a small team ' +
          'for personal listening. It is provided for **educational and ' +
          'personal, non-commercial use**. Its source code is published under ' +
          'the GNU General Public License, version 3 (GPL-3.0).',
      ],
    },
    {
      heading: '2. Where the music comes from',
      paras: [
        'Relaxify does not host, upload, store for others or sell any music. ' +
          'When you search or press play, the app requests audio that ' +
          '**JioSaavn**, **SoundCloud** and **YouTube** already make publicly ' +
          'available, in the same way their own websites and apps do, and ' +
          'plays it on your phone.',
        'All songs, artwork, lyrics and names remain the property of their ' +
          'artists, labels and the services above. Relaxify is **not ' +
          'affiliated with, endorsed by or sponsored by** JioSaavn, SoundCloud, ' +
          'YouTube, Google or Spotify. Their names and trademarks belong to ' +
          'their owners and are used here only to say where music comes from.',
      ],
    },
    {
      heading: '3. Your use',
      paras: ['When you use Relaxify, you agree to:'],
      list: [
        'use it for your own personal listening only;',
        'keep downloaded songs on your own phone for offline listening, and ' +
          'not copy, share, sell or publish them;',
        'respect the terms of JioSaavn, SoundCloud and YouTube, and the ' +
          'copyright law where you live;',
        'not use the app, or its code, to overload, scrape or harm those ' +
          'services;',
        'be respectful to others in a Jam, including in the names you choose.',
      ],
    },
    {
      heading: '4. Playlist import',
      paras: [
        'Importing reads the song list of a **public** Spotify playlist or ' +
          'album, or a public YouTube or YouTube Music playlist, from its ' +
          'link. No account is used. No music is taken from Spotify: each ' +
          'song is looked up on the sources above. A YouTube song that none ' +
          'of them has is kept as the YouTube original.',
      ],
    },
    {
      heading: '5. Availability',
      paras: [
        'Songs can disappear or stop playing when a source removes them, ' +
          'limits them to some countries, or changes how it works. Relaxify ' +
          'may change, pause or end any feature, including Jam and updates, ' +
          'at any time.',
      ],
    },
    {
      heading: '6. No warranty',
      paras: [
        'Relaxify is provided **"as is"**, without warranty of any kind, as ' +
          'set out in the GPL-3.0. To the extent the law allows, its makers ' +
          'are not liable for any loss or damage arising from its use, ' +
          'including lost data, mobile data charges or interrupted playback.',
      ],
    },
    {
      heading: '7. Changes to these terms',
      paras: [
        'These terms may be updated with a new version of the app. The date ' +
          'at the top shows the latest change. Using Relaxify after an update ' +
          'means you accept the updated terms.',
      ],
    },
    {heading: '8. Contact', paras: [CONTACT]},
  ],
};

export const PRIVACY: LegalDoc = {
  key: 'privacy',
  title: 'Privacy',
  intro:
    'Relaxify has no accounts and no sign-in. This statement says what ' +
    'leaves your phone, what stays on it, and who else sees what.',
  sections: [
    {
      heading: '1. Usage statistics',
      paras: [
        `To improve the app, Relaxify sends usage statistics to Google Firebase: ${COLLECTED_ITEMS}. ${COLLECTED_PROMISE}`,
        'Your approximate location is worked out by Google from your internet ' +
          'address; the app never asks for your phone\'s location.',
      ],
    },
    {
      heading: '2. Crash reports',
      paras: [
        'If the app crashes, a report goes to Google Firebase Crashlytics: ' +
          'what failed in the code, the app version, the phone model and the ' +
          'Android version. It is linked to the same anonymous ID.',
      ],
    },
    {
      heading: '3. Jam and shared playlists',
      paras: [JAM_NOTE, SHARE_NOTE],
    },
    {
      heading: '4. What stays on your phone',
      paras: [
        'Your likes, playlists (except those you share), the artists you ' +
          'follow, downloads, search history, settings and your **Recap** are ' +
          'kept only on your phone. The Recap is worked out on the phone and ' +
          'sends nothing.',
      ],
    },
    {
      heading: '5. What we never collect',
      list: [
        'your name, email address, phone number or any account;',
        'your contacts, photos, files or messages;',
        'your precise location;',
        'anything from your microphone or camera.',
      ],
    },
    {
      heading: '6. Services the app talks to',
      paras: [
        'To find and play music, the app contacts these services directly ' +
          'from your phone. Like any website you visit, they can see your ' +
          'internet address and what was requested, under their own privacy ' +
          'policies:',
      ],
      list: [
        '**JioSaavn**, **SoundCloud** and **YouTube**, for search and ' +
          'playback (YouTube when switched on in Settings, and for songs ' +
          'imported from it); JioSaavn also for new releases from the artists ' +
          'you follow and the right cover for songs you saved;',
        '**Spotify** or **YouTube**, when you import a playlist link from it;',
        '**LRCLIB**, for lyrics;',
        '**MusicBrainz**, **Cover Art Archive**, **Deezer**, **Apple iTunes**, ' +
          '**TheAudioDB** and **Last.fm**, for song details, artist photos ' +
          'and artwork;',
        '**GitHub**, to check for and download updates;',
        '**Google** and **Cloudflare**, only to check whether the phone is ' +
          'online when something fails to load.',
      ],
    },
    {
      heading: '7. Your choices',
      paras: [
        'Usage statistics cannot be switched off inside the app. Because ' +
          'they are not linked to you, we cannot find or delete one ' +
          'person\'s statistics. Uninstalling Relaxify stops all collection ' +
          'and removes everything the app kept on your phone.',
      ],
    },
    {
      heading: '8. Children',
      paras: [
        'Relaxify is not directed at children under 13 and does not knowingly ' +
          'collect anything from them.',
      ],
    },
    {
      heading: '9. Changes',
      paras: [
        'If this statement changes, the new version ships with an app update ' +
          'and the date at the top changes with it.',
      ],
    },
    {heading: '10. Contact', paras: [CONTACT]},
  ],
};

/** The credit line under the legal rows and in the docs footer. */
export const CREDITS =
  `Music from ${SOURCES.join(', ').replace(/, ([^,]*)$/, ' and $1')}. ` +
  'Relaxify is not affiliated with them. For educational and personal use.';

/** Split `**bold**` markup into runs, for either renderer. */
export function boldRuns(s: string): {text: string; bold: boolean}[] {
  return s
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map(part =>
      part.startsWith('**')
        ? {text: part.slice(2, -2), bold: true}
        : {text: part, bold: false},
    );
}
