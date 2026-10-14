/**
 * The drawings behind src/glyphs.tsx: the few icons that are Relaxify's own
 * rather than lucide's (the tab bar, the player's controls, the add / saved
 * circle, headphones, delete).
 *
 * Plain data on a 24 grid so the same numbers can be drawn anywhere (the app,
 * the Figma sheet). A part with `w` is a line of that weight with round ends;
 * a part without one is filled. `ink` parts are always drawn in the page's
 * black, whatever colour the icon is: the tick cut into the saved disc.
 *
 * One weight across the set (2, a little under for the slim ones), so a tab,
 * a + and a shuffle side by side read as one family.
 */
export type GlyphPart = {d: string; w?: number; ink?: boolean};

export const GLYPHS = {
  home: [
    {
      d: 'M9.5 21V15a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6H20a1 1 0 0 0 1-1V8.18a1.5 1.5 0 0 0-.75-1.3l-7.5-4.33a1.5 1.5 0 0 0-1.5 0l-7.5 4.33A1.5 1.5 0 0 0 3 8.18V20a1 1 0 0 0 1 1h5.5z',
      w: 2,
    },
  ],
  // The same house, filled. The door stays open: the outline runs round it.
  homeOn: [
    {
      d: 'M9.5 21V15a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6H20a1 1 0 0 0 1-1V8.18a1.5 1.5 0 0 0-.75-1.3l-7.5-4.33a1.5 1.5 0 0 0-1.5 0l-7.5 4.33A1.5 1.5 0 0 0 3 8.18V20a1 1 0 0 0 1 1h5.5z',
    },
    {
      d: 'M9.5 21V15a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6H20a1 1 0 0 0 1-1V8.18a1.5 1.5 0 0 0-.75-1.3l-7.5-4.33a1.5 1.5 0 0 0-1.5 0l-7.5 4.33A1.5 1.5 0 0 0 3 8.18V20a1 1 0 0 0 1 1h5.5z',
      w: 2,
    },
  ],
  search: [
    {d: 'M18.5 10.75a7.75 7.75 0 1 1-15.5 0 7.75 7.75 0 1 1 15.5 0z', w: 2},
    {d: 'M16.4 16.4 21 21', w: 2},
  ],
  // Selected: the lens gains a solid circle inside it.
  searchOn: [
    {d: 'M18.5 10.75a7.75 7.75 0 1 1-15.5 0 7.75 7.75 0 1 1 15.5 0z', w: 2.2},
    {d: 'M16.4 16.4 21 21', w: 2.2},
    {d: 'M15.15 10.75a4.4 4.4 0 1 1-8.8 0 4.4 4.4 0 1 1 8.8 0z'},
  ],
  // Two spines and a book leaning on them.
  library: [
    {d: 'M3 3v18M9 3v18', w: 2},
    {
      d: 'M15 3.6 20.4 6.8c.38.22.6.62.6 1.05V20a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z',
      w: 2,
    },
  ],
  libraryOn: [
    {d: 'M3 3v18M9 3v18', w: 2},
    {
      d: 'M15 3.6 20.4 6.8c.38.22.6.62.6 1.05V20a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z',
    },
    {
      d: 'M15 3.6 20.4 6.8c.38.22.6.62.6 1.05V20a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z',
      w: 2,
    },
  ],
  // Long arms and a thin line: the + beside "Your Library".
  plus: [{d: 'M12 2.5v19M2.5 12h19', w: 1.9}],
  shuffle: [
    {
      d: 'M2 17.75h1.9c1.95 0 3.25-.75 4.5-2.3l5.4-6.9c1.25-1.55 2.55-2.3 4.5-2.3h3.2',
      w: 1.9,
    },
    {d: 'M18.95 3.5l2.75 2.75-2.75 2.75', w: 1.9},
    {d: 'M2 6.25h1.9c1.95 0 3.25.75 4.5 2.3l1.2 1.53', w: 1.9},
    {
      d: 'M12.6 13.92l1.2 1.53c1.25 1.55 2.55 2.3 4.5 2.3h3.2',
      w: 1.9,
    },
    {d: 'M18.95 15l2.75 2.75-2.75 2.75', w: 1.9},
  ],
  repeat: [
    {
      d: 'M7.5 18.5h-1a4 4 0 0 1-4-4v-6a4 4 0 0 1 4-4h11a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-7',
      w: 1.9,
    },
    {d: 'M13.25 15.75 10.5 18.5l2.75 2.75', w: 1.9},
  ],
  more: [
    {d: 'M13.6 5a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 1 1 3.2 0z'},
    {d: 'M13.6 12a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 1 1 3.2 0z'},
    {d: 'M13.6 19a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 1 1 3.2 0z'},
  ],
  // Song rows: the dots lie down. The standing ⋮ above is for the screen's
  // own menu (player, playlist page).
  moreH: [
    {d: 'M6.5 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 1 1 3 0z'},
    {d: 'M13.5 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 1 1 3 0z'},
    {d: 'M20.5 12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 1 1 3 0z'},
  ],
  // Now playing as a pill, what comes next as two lines.
  queue: [
    {d: 'M5.5 3.5h13a2.5 2.5 0 0 1 0 5h-13a2.5 2.5 0 0 1 0-5z', w: 1.8},
    {d: 'M3 14h18M3 19.5h18', w: 1.9},
  ],
  // The queue with a + where the last line ends.
  addQueue: [
    {d: 'M5.5 3.5h8a2.5 2.5 0 0 1 0 5h-8a2.5 2.5 0 0 1 0-5z', w: 1.8},
    {d: 'M3 14h10.5M3 19.5h7', w: 1.9},
    {d: 'M18 12.5v8M14 16.5h8', w: 1.9},
  ],
  // Two notes and a +.
  addPlaylist: [
    {d: 'M5.8 2.9v5.8M2.9 5.8h5.8', w: 1.8},
    {d: 'M8.8 11.6v7a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 1 1 4.6 0', w: 1.8},
    {d: 'M12.6 5.2h8.3v13.4a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 1 1 4.6 0', w: 1.8},
  ],
  // Head and shoulders in one line, for "Go to artist".
  artist: [
    {
      d: 'M4 20.5v-2.1c0-.95.53-1.82 1.38-2.25l3.82-1.9c.7-.35.9-1.91.4-2.25A4.24 4.24 0 1 1 14.4 12c-.5.34-.3 1.9.4 2.25l3.82 1.9c.85.43 1.38 1.3 1.38 2.25v2.1z',
      w: 1.9,
    },
  ],
  // One round band. Its outer edge carries on down into two slanted cups,
  // each closed by a flat top and a rounded foot.
  headphones: [
    {
      d: 'M3.06 14.06h3.22l2.5 3.77a1.4 1.4 0 0 1-2.28 1.52A9.18 9.18 0 1 1 17.5 19.35a1.4 1.4 0 0 1-2.28-1.52l2.5-3.77h3.22',
      w: 1.8,
    },
  ],
  // Nothing connected: the sound is coming from this phone. A phone seen
  // from the side, half behind a speaker.
  devices: [
    {
      d: 'M7.7 4.4H3.9a1.2 1.2 0 0 0-1.2 1.2v8.35a1.2 1.2 0 0 0 1.2 1.2h2.4',
      w: 1.6,
    },
    {d: 'M4.75 19.4h1.3v1.3h-1.3z'},
    {
      d: 'M12.7 3.85h6.6a2 2 0 0 1 2 2v12.35a2 2 0 0 1-2 2h-6.6a2 2 0 0 1-2-2V5.85a2 2 0 0 1 2-2z',
      w: 1.6,
    },
    {d: 'M16.95 7.7a1 1 0 1 1-2 0 1 1 0 1 1 2 0z'},
    {d: 'M18.3 14.6a2.35 2.35 0 1 1-4.7 0 2.35 2.35 0 1 1 4.7 0z', w: 1.6},
  ],
  // A stopwatch: the sleep timer.
  timer: [
    {d: 'M9.25 2.25h5.5M12 2.25v3.6', w: 1.9},
    {d: 'M19.75 13.6a7.75 7.75 0 1 1-15.5 0 7.75 7.75 0 1 1 15.5 0z', w: 1.9},
    {d: 'M12 9v4.4', w: 1.9},
  ],
  play: [
    {
      d: 'M7.1 3.85l12.6 7.3a1 1 0 0 1 0 1.7L7.1 20.15a1 1 0 0 1-1.5-.85V4.7a1 1 0 0 1 1.5-.85z',
    },
  ],
  pause: [
    {
      d: 'M5.7 3h2.6a.7.7 0 0 1 .7.7v16.6a.7.7 0 0 1-.7.7H5.7a.7.7 0 0 1-.7-.7V3.7a.7.7 0 0 1 .7-.7zm10 0h2.6a.7.7 0 0 1 .7.7v16.6a.7.7 0 0 1-.7.7h-2.6a.7.7 0 0 1-.7-.7V3.7a.7.7 0 0 1 .7-.7z',
    },
  ],
  add: [
    {d: 'M22 12a10 10 0 1 1-20 0 10 10 0 1 1 20 0z', w: 1.6},
    {d: 'M12 6.4v11.2M6.4 12h11.2', w: 1.7},
  ],
  // A solid disc with a dark tick, whatever the page behind it.
  saved: [
    {d: 'M22.8 12a10.8 10.8 0 1 1-21.6 0 10.8 10.8 0 1 1 21.6 0z'},
    {d: 'M7.3 12.3l3.3 3.3 6.2-6.2', w: 2.2, ink: true},
  ],
  trash: [
    {d: 'M3.5 6.25h17', w: 1.8},
    {d: 'M9 6.25V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.75', w: 1.8},
    {
      d: 'M5.75 6.25l.95 13.35a1.75 1.75 0 0 0 1.75 1.65h7.1a1.75 1.75 0 0 0 1.75-1.65l.95-13.35',
      w: 1.8,
    },
    {d: 'M10 10.5V17M14 10.5V17', w: 1.8},
  ],
} satisfies Record<string, GlyphPart[]>;

export type GlyphName = keyof typeof GLYPHS;
