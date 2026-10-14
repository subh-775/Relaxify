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
  // Now playing as a pill, what comes next as two lines.
  queue: [
    {d: 'M5.5 3.5h13a2.5 2.5 0 0 1 0 5h-13a2.5 2.5 0 0 1 0-5z', w: 1.8},
    {d: 'M3 14h18M3 19.5h18', w: 1.9},
  ],
  // One band, two D-shaped cups with their flat side inward.
  headphones: [
    {d: 'M3 17v-5a9 9 0 0 1 18 0v5', w: 1.9},
    {d: 'M3 15.5A2.5 2.5 0 0 1 5.5 13h2v8.5h-2A2.5 2.5 0 0 1 3 19z', w: 1.9},
    {
      d: 'M21 15.5a2.5 2.5 0 0 0-2.5-2.5h-2v8.5h2a2.5 2.5 0 0 0 2.5-2.5z',
      w: 1.9,
    },
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
    {d: 'M21.25 12a9.25 9.25 0 1 1-18.5 0 9.25 9.25 0 1 1 18.5 0z', w: 1.7},
    {d: 'M12 7.5v9M7.5 12h9', w: 1.7},
  ],
  // A solid disc with a dark tick, whatever the page behind it.
  saved: [
    {d: 'M22.25 12a10.25 10.25 0 1 1-20.5 0 10.25 10.25 0 1 1 20.5 0z'},
    {d: 'M7.5 12.3l3.1 3.1 5.9-5.9', w: 2.1, ink: true},
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
