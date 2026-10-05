/**
 * One source of truth for colour, spacing and type. Screens read from here so
 * the app stays visually consistent as it grows — no per-file magic values.
 */
export const C = {
  bg: '#000000',   // true black: AMOLED pixels off, not near-black
  surface: '#121212',
  surfaceHi: '#1c1c1c',
  text: '#f4f5f7',
  sub: '#9096a2',
  faint: '#5c626e',
  /** The logo's red (Ember): the app's own colour wherever one colour
   *  stands for Relaxify itself, such as the Library's chips. */
  brand: '#FF5A6E',
  /** The interactive/active colour: on, selected, playing, done. The logo's
   *  colour, so what is "on" looks like Relaxify (it was Spotify's green). */
  accent: '#FF5A6E',
  /** Destructive only: a true red, so a warning never reads as "on" next to
   *  the coral accent. Big actions fill with it (white text); icons wear it. */
  danger: '#FF3B30',
  border: 'rgba(255,255,255,0.08)',
};

export const S = {
  gutter: 18,
  gap: 12,
  radius: 10,
};

/**
 * Type scale. Sizes are the base values put through [fs], which lifts
 * everything a couple of percent — enough to read easier on a phone without
 * reflowing any layout.
 */
export const TYPE_SCALE = 1.02;

/** Scale a font size by TYPE_SCALE, rounded to the nearest half point. */
export const fs = (size: number): number =>
  Math.round(size * TYPE_SCALE * 2) / 2;

// lineHeight is explicit on the title styles: Android crops the descender of a
// big bold letter (the 'g' in "Good morning" / "Settings") when a line is left
// to its default height, so every title gets ~1.3× breathing room.
export const T = {
  screenTitle: {
    fontSize: fs(26),
    lineHeight: fs(34),
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  rowTitle: {
    fontSize: fs(17),
    lineHeight: fs(23),
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },
  body: {fontSize: fs(14.5), fontWeight: '600' as const},
  sub: {fontSize: fs(12.5), fontWeight: '500' as const},
};
