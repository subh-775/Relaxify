/**
 * The third-party software the app ships, as the NOTICE file lists it.
 * Keep the two in step when a dependency is added or removed.
 */
export const LICENCES: {group: string; items: [string, string][]}[] = [
  {
    group: 'JavaScript (React Native)',
    items: [
      ['React, React Native', 'MIT'],
      ['react-native-track-player', 'Apache-2.0'],
      ['react-native-reanimated', 'MIT'],
      ['react-native-gesture-handler', 'MIT'],
      ['react-native-draggable-flatlist (modified)', 'MIT'],
      ['react-native-svg', 'MIT'],
      ['@react-native-async-storage/async-storage', 'MIT'],
      ['lucide-react-native', 'ISC'],
    ],
  },
  {
    group: 'Android',
    items: [
      ['NewPipeExtractor', 'GPL-3.0'],
      ['Chaquopy (embedded Python)', 'MIT'],
      ['AndroidX Palette', 'Apache-2.0'],
    ],
  },
  {
    group: 'Python (embedded)',
    items: [
      ['Flask', 'BSD-3-Clause'],
      ['requests', 'Apache-2.0'],
      ['mutagen', 'GPL-2.0-or-later'],
      ['yt-dlp', 'Unlicense'],
    ],
  },
  {
    group: 'Fonts',
    items: [['Plus Jakarta Sans', 'SIL Open Font License 1.1']],
  },
];
