/**
 * Relaxify's own icon set, as data.
 *
 * Every glyph is drawn here once, on a 24-unit grid, and everything that shows
 * an icon draws from this file: the app (src/icons.tsx), the home-screen widget
 * and the notification buttons (scripts/icons.ts writes their vector
 * drawables), and the Figma library. One drawing, so the app, the widget and
 * the design file cannot drift apart.
 *
 * The language is Spotify's, drawn fresh rather than copied:
 *  - Outline at rest, SOLID when on. A selected tab, a liked song and a
 *    downloaded one fill in; nothing changes shape between the two states.
 *  - One stroke weight everywhere (STROKE below), flat line ends and soft
 *    corners: crisp at 12px, not bubbly at 32.
 *  - Transport is solid and slim: a narrow triangle and two thin bars.
 *  - "Saved" and "downloaded" are a solid disc with the mark CUT OUT of it, so
 *    the page shows through the tick instead of a second colour drawn on top.
 *
 * Pure data and plain functions, no React Native imports, so a Node script can
 * read it as it stands.
 */

/** Line weight on the 24 grid, at the default emphasis. */
export const STROKE = 1.8;

export type Part = {
  d: string;
  /** stroke (default): drawn as a line. fill: a solid shape, even-odd, so an
   *  inner shape cuts a hole. both: filled AND stroked, so a solid shape is as
   *  big as its outline twin. */
  mode?: 'stroke' | 'fill' | 'both';
  /** Multiplies the stroke weight for this part only. */
  w?: number;
  cap?: 'butt' | 'round' | 'square';
  join?: 'miter' | 'round' | 'bevel';
};

export type Glyph = {
  line: Part[];
  /** The "on" drawing. Absent: the glyph has one state. */
  solid?: Part[];
};

type Pt = [number, number];

const n = (v: number) => String(Math.round(v * 100) / 100);
const pt = ([x, y]: Pt) => `${n(x)} ${n(y)}`;

/** A circle as a path (two half arcs), so every target can draw it. */
export function circle(cx: number, cy: number, r: number): string {
  return (
    `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0` +
    `a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`
  );
}

/** A rounded rectangle. */
export function rrect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  const a = `${n(r)} ${n(r)} 0 0 1`;
  return (
    `M${n(x + r)} ${n(y)}h${n(w - 2 * r)}a${a} ${n(r)} ${n(r)}` +
    `v${n(h - 2 * r)}a${a} ${n(-r)} ${n(r)}h${n(-(w - 2 * r))}` +
    `a${a} ${n(-r)} ${n(-r)}v${n(-(h - 2 * r))}a${a} ${n(r)} ${n(-r)}Z`
  );
}

/** A polygon with every corner eased by `r` (a quadratic through the
 *  vertex). Used for the transport triangles: sharp enough to read as a
 *  point, soft enough not to look cut out with scissors. */
export function roundPoly(points: Pt[], r: number): string {
  const len = points.length;
  const unit = (a: Pt, b: Pt): Pt => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  let d = '';
  points.forEach((v, i) => {
    const prev = points[(i + len - 1) % len];
    const next = points[(i + 1) % len];
    const up = unit(v, prev);
    const un = unit(v, next);
    const a: Pt = [v[0] + up[0] * r, v[1] + up[1] * r];
    const b: Pt = [v[0] + un[0] * r, v[1] + un[1] * r];
    d += `${i === 0 ? 'M' : 'L'}${pt(a)}Q${pt(v)} ${pt(b)}`;
  });
  return d + 'Z';
}

/**
 * A polyline `w` wide, as a closed outline (mitred joins, flat ends).
 *
 * For cut-outs: a tick knocked out of a disc has to be a SHAPE, because an
 * even-odd hole is made of filled area, not of a stroke.
 */
export function thick(points: Pt[], w: number): string {
  const h = w / 2;
  const normals: Pt[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const l = Math.hypot(x1 - x0, y1 - y0) || 1;
    normals.push([-(y1 - y0) / l, (x1 - x0) / l]);
  }
  const left: Pt[] = [];
  const right: Pt[] = [];
  points.forEach((p, i) => {
    let m: Pt;
    let k = h;
    if (i === 0) {
      m = normals[0];
    } else if (i === points.length - 1) {
      m = normals[i - 1];
    } else {
      const a = normals[i - 1];
      const b = normals[i];
      const s: Pt = [a[0] + b[0], a[1] + b[1]];
      const l = Math.hypot(s[0], s[1]) || 1;
      m = [s[0] / l, s[1] / l];
      k = h / (m[0] * b[0] + m[1] * b[1]);
    }
    left.push([p[0] + m[0] * k, p[1] + m[1] * k]);
    right.push([p[0] - m[0] * k, p[1] - m[1] * k]);
  });
  const ring = [...left, ...right.reverse()];
  return 'M' + ring.map(pt).join('L') + 'Z';
}

/** A four-point sparkle: four concave sides meeting at the tips. */
function sparkle(cx: number, cy: number, r: number): string {
  const c = `${n(cx)} ${n(cy)}`;
  return (
    `M${n(cx)} ${n(cy - r)}Q${c} ${n(cx + r)} ${n(cy)}` +
    `Q${c} ${n(cx)} ${n(cy + r)}Q${c} ${n(cx - r)} ${n(cy)}` +
    `Q${c} ${n(cx)} ${n(cy - r)}Z`
  );
}

const mirror = (ps: Pt[]): Pt[] => ps.map(([x, y]) => [24 - x, y]);

const s = (d: string, extra: Partial<Part> = {}): Part => ({d, ...extra});
const f = (d: string, extra: Partial<Part> = {}): Part => ({
  d,
  mode: 'fill',
  ...extra,
});
const b = (d: string, extra: Partial<Part> = {}): Part => ({
  d,
  mode: 'both',
  ...extra,
});

/* ------------------------------------------------------------------ shapes */

const CHECK: Pt[] = [
  [7.2, 12.3],
  [10.5, 15.6],
  [16.9, 9.2],
];
const DOWN_ARROW: Pt[] = [
  [11, 6.6],
  [13, 6.6],
  [13, 12.6],
  [16, 12.6],
  [12, 16.9],
  [8, 12.6],
  [11, 12.6],
];

const HOME_LINE = 'M3.9 10.1 12 3.4l8.1 6.7V20.6h-5.6v-5.8H9.5v5.8H3.9Z';
const HEART =
  'M12 20.4 4.3 12.9a4.85 4.85 0 0 1 6.86-6.86L12 6.9l.84-.86a4.85 4.85 0 0 1 6.86 6.86Z';
const PLAY: Pt[] = [
  [6.6, 4.2],
  [19.4, 12],
  [6.6, 19.8],
];
const SKIP: Pt[] = [
  [5, 4.9],
  [15.6, 12],
  [5, 19.1],
];
// One continuous line: in round the left cup, up the band, round the right
// cup — so there is no seam where band meets cup.
const HEADPHONES =
  'M4 13.8h2.2a1.8 1.8 0 0 1 1.8 1.8v3.8a1.8 1.8 0 0 1-1.8 1.8h-.4A1.8 1.8 0 0 1 4 19.4V12.4a8 8 0 0 1 16 0v7a1.8 1.8 0 0 1-1.8 1.8h-.4a1.8 1.8 0 0 1-1.8-1.8v-3.8a1.8 1.8 0 0 1 1.8-1.8H20';
const CUP_L =
  'M4 13.8h2.2a1.8 1.8 0 0 1 1.8 1.8v3.8a1.8 1.8 0 0 1-1.8 1.8h-.4A1.8 1.8 0 0 1 4 19.4Z';
const CUP_R =
  'M20 13.8h-2.2a1.8 1.8 0 0 0-1.8 1.8v3.8a1.8 1.8 0 0 0 1.8 1.8h.4a1.8 1.8 0 0 0 1.8-1.8Z';
const BOOK: Pt[] = [
  [13.1, 4.9],
  [16.3, 3.9],
  [21, 19.2],
  [17.8, 20.2],
];

/* ------------------------------------------------------------------ glyphs */

export const GLYPHS = {
  // ---- Navigation
  Home: {
    line: [s(HOME_LINE)],
    solid: [b(HOME_LINE)],
  },
  Search: {
    line: [s(circle(10.6, 10.6, 6.8)), s('M15.6 15.6 21 21')],
    // On: the same lens, a little heavier, with a second circle inside it —
    // still a magnifier, but plainly the selected one. A filled lens would
    // read as a different object.
    solid: [
      s(circle(10.6, 10.6, 6.8), {w: 1.2}),
      s(circle(10.6, 10.6, 3.1), {w: 1.2}),
      s('M15.6 15.6 21 21', {w: 1.2}),
    ],
  },
  Library: {
    line: [s('M4.5 3.6v16.8'), s('M9.3 3.6v16.8'), s(roundPoly(BOOK, 0.5))],
    solid: [
      f(rrect(3.2, 3.2, 2.6, 17.6, 0.5)),
      f(rrect(8, 3.2, 2.6, 17.6, 0.5)),
      b(roundPoly(BOOK, 0.5)),
    ],
  },

  // ---- Transport (solid in both states)
  Play: {line: [f(roundPoly(PLAY, 1.3))]},
  Pause: {
    line: [
      f(rrect(6.4, 4.2, 3.6, 15.6, 0.9)),
      f(rrect(14, 4.2, 3.6, 15.6, 0.9)),
    ],
  },
  SkipForward: {
    line: [f(roundPoly(SKIP, 1.1)), f(rrect(16.8, 4.6, 2.3, 14.8, 0.8))],
  },
  SkipBack: {
    line: [
      f(roundPoly(mirror(SKIP), 1.1)),
      f(rrect(24 - 16.8 - 2.3, 4.6, 2.3, 14.8, 0.8)),
    ],
  },
  Shuffle: {
    line: [
      s('M2.8 17h3c1.5 0 2.6-.7 3.5-1.9l4.9-6.2c.9-1.2 2-1.9 3.5-1.9h3.1'),
      s('M2.8 7h3c1.5 0 2.6.7 3.5 1.9l.8 1'),
      s('M13.9 14.1l.8 1c.9 1.2 2 1.9 3.5 1.9h3.1'),
      s('M18.3 4.2 21.1 7l-2.8 2.8'),
      s('M18.3 14.2l2.8 2.8-2.8 2.8'),
    ],
  },
  Repeat: {
    line: [
      s('M3.6 12.8V9.6a3.4 3.4 0 0 1 3.4-3.4h12.6'),
      s('M16.9 3.4l2.8 2.8-2.8 2.8'),
      s('M20.4 11.2v3.2a3.4 3.4 0 0 1-3.4 3.4H4.4'),
      s('M7.1 20.6l-2.8-2.8 2.8-2.8'),
    ],
  },
  /** Repeat this song: the loop with a 1 inside it. */
  RepeatOne: {
    line: [
      s('M3.6 12.8V9.6a3.4 3.4 0 0 1 3.4-3.4h12.6'),
      s('M16.9 3.4l2.8 2.8-2.8 2.8'),
      s('M20.4 11.2v3.2a3.4 3.4 0 0 1-3.4 3.4H4.4'),
      s('M7.1 20.6l-2.8-2.8 2.8-2.8'),
      s('M10.9 10.3l1.5-1v5.6', {w: 0.85}),
    ],
  },
  Queue: {
    line: [
      s(rrect(3.4, 3.6, 17.2, 6, 1.4)),
      s('M3.4 14.4h17.2'),
      s('M3.4 19.6h17.2'),
    ],
    solid: [
      b(rrect(3.4, 3.6, 17.2, 6, 1.4)),
      s('M3.4 14.4h17.2'),
      s('M3.4 19.6h17.2'),
    ],
  },
  /** Lyrics: a caption box. */
  Lyrics: {
    line: [
      s(rrect(3.3, 4.4, 17.4, 15.2, 2)),
      s('M7 14.8h4'),
      s('M13.4 14.8h3.6'),
    ],
    solid: [
      f(
        rrect(2.4, 3.5, 19.2, 17, 2.8) +
          thick(
            [
              [7, 14.8],
              [11, 14.8],
            ],
            1.8,
          ) +
          thick(
            [
              [13.4, 14.8],
              [17, 14.8],
            ],
            1.8,
          ),
      ),
    ],
  },
  /** The band runs down the outside of each cup; solid fills the cups. */
  Headphones: {
    line: [s(HEADPHONES)],
    solid: [s(HEADPHONES), f(CUP_L), f(CUP_R)],
  },
  Speaker: {
    line: [
      s(rrect(5, 2.6, 14, 18.8, 2.4)),
      s(circle(12, 14.6, 3.4)),
      f(circle(12, 7, 1.3)),
    ],
  },
  /** Speed: a dial with its needle. */
  Gauge: {
    line: [
      s('M4.6 18.4a8.6 8.6 0 1 1 14.8 0'),
      s('M12 14l3.9-3.9'),
      f(circle(12, 14, 1.7)),
    ],
  },
  Timer: {
    line: [
      s(circle(12, 13.6, 7.8)),
      s('M12 13.6V9.6'),
      s('M9.6 2.6h4.8'),
      s('M12 2.6v3.2'),
    ],
  },
  Moon: {
    line: [s('M19.9 14.6A8.3 8.3 0 1 1 9.4 4.1a6.6 6.6 0 0 0 10.5 10.5Z')],
    solid: [b('M19.9 14.6A8.3 8.3 0 1 1 9.4 4.1a6.6 6.6 0 0 0 10.5 10.5Z')],
  },

  // ---- Save, like, download
  Heart: {
    line: [s(HEART)],
    solid: [b(HEART)],
  },
  /** Add (+) at rest; solid = the saved disc with the tick cut out. */
  // Slimmer than the rest of the set (0.75×): a big ring at full weight
  // shouts, and this one sits on every player. Its ring-shaped neighbours,
  // the saved tick and download, match it.
  CirclePlus: {
    line: [
      s(circle(12, 12, 9.2), {w: 0.75}),
      s('M12 8v8', {w: 0.75}),
      s('M8 12h8', {w: 0.75}),
    ],
    solid: [f(circle(12, 12, 10) + thick(CHECK, 2.1))],
  },
  CircleCheck: {
    line: [
      s(circle(12, 12, 9.2), {w: 0.75}),
      s('M7.8 12.3l2.8 2.8 5.6-5.6', {w: 0.75}),
    ],
    solid: [f(circle(12, 12, 10) + thick(CHECK, 2.1))],
  },
  /** Download: arrow in a ring; solid = done, the arrow cut out of a disc. */
  Download: {
    line: [
      s(circle(12, 12, 9.2), {w: 0.75}),
      s('M12 7.2v8.6', {w: 0.75}),
      s('M8.5 12.3l3.5 3.5 3.5-3.5', {w: 0.75}),
    ],
    solid: [f(circle(12, 12, 10) + 'M' + DOWN_ARROW.map(pt).join('L') + 'Z')],
  },
  ArrowDownToLine: {
    line: [s('M12 3.6v12'), s('M7.2 11l4.8 4.8 4.8-4.8'), s('M4.6 20.4h14.8')],
    solid: [
      s('M12 3.6v12', {w: 1.35}),
      s('M7.2 11l4.8 4.8 4.8-4.8', {w: 1.35}),
      s('M4.6 20.4h14.8', {w: 1.35}),
    ],
  },

  // ---- Menus and rows
  MoreVertical: {
    line: [
      f(circle(12, 5, 1.75) + circle(12, 12, 1.75) + circle(12, 19, 1.75)),
    ],
  },
  MoreHorizontal: {
    line: [
      f(circle(5, 12, 1.75) + circle(12, 12, 1.75) + circle(19, 12, 1.75)),
    ],
  },
  /** Add to queue: the list with a + where the first song would be. */
  ListPlus: {
    line: [
      s('M6.2 2.8v7'),
      s('M2.7 6.3h7'),
      s('M12.6 6.3h8.6'),
      s('M2.8 12.8h18.4'),
      s('M2.8 19.2h18.4'),
    ],
  },
  /** Add to playlist: three rows and a + below them. */
  PlaylistAdd: {
    line: [
      s('M3 5.6h13'),
      s('M3 10.8h13'),
      s('M3 16h7.4'),
      s('M17.4 12.6v8.6'),
      s('M13.1 16.9h8.6'),
    ],
  },
  ListX: {
    line: [
      s('M3 5.6h13'),
      s('M3 10.8h13'),
      s('M3 16h7.4'),
      s('M14.2 13.7l6 6'),
      s('M20.2 13.7l-6 6'),
    ],
  },
  /** The drag handle on a queue row. */
  Grip: {
    line: [s('M4.6 9.4h14.8'), s('M4.6 14.6h14.8')],
  },
  /** Go to album: a record, ring and spindle hole. */
  Disc: {
    line: [s(circle(12, 12, 9.1)), s(circle(12, 12, 2.4))],
    solid: [f(circle(12, 12, 10) + circle(12, 12, 2.4))],
  },
  /** Go to artist: a person with a note beside them. */
  Artist: {
    line: [
      s(circle(9.4, 7.6, 3.9)),
      s('M2.8 20.6c0-3.9 3-6.5 6.6-6.5 1.4 0 2.7.4 3.7 1.1'),
      s('M19.2 11.2v7.6'),
      s('M19.2 11.2c.5 1.2 1.4 1.8 2.4 2.1', {cap: 'round'}),
      f(circle(17.4, 18.9, 1.95)),
    ],
  },
  User: {
    line: [
      s(circle(12, 8, 4.2)),
      s('M4.2 20.8c0-4.3 3.5-7.1 7.8-7.1s7.8 2.8 7.8 7.1'),
    ],
    solid: [
      b(circle(12, 8, 4.2)),
      b('M4.2 20.8c0-4.3 3.5-7.1 7.8-7.1s7.8 2.8 7.8 7.1Z'),
    ],
  },
  /** Song radio. */
  Radio: {
    line: [
      f(circle(12, 12, 1.9)),
      s('M8.8 8.8a4.53 4.53 0 0 0 0 6.4'),
      s('M15.2 8.8a4.53 4.53 0 0 1 0 6.4'),
      s('M5.6 5.6a9.05 9.05 0 0 0 0 12.8'),
      s('M18.4 5.6a9.05 9.05 0 0 1 0 12.8'),
    ],
  },
  Share: {
    line: [
      s(circle(17.8, 5.4, 2.5)),
      s(circle(6.2, 12, 2.5)),
      s(circle(17.8, 18.6, 2.5)),
      s('M8.4 10.8l7.2-4.1'),
      s('M8.4 13.2l7.2 4.1'),
    ],
  },
  /** An arrow leaving the box — for links that open somewhere else. */
  ArrowUpRight: {
    line: [s('M7 17 17 7'), s('M8.6 7H17v8.4')],
  },
  ArrowRight: {
    line: [s('M3.8 12h16'), s('M14.2 6.4 19.8 12l-5.6 5.6')],
  },
  ArrowLeftRight: {
    line: [
      s('M4 8h15.2'),
      s('M15.6 4.4 19.2 8l-3.6 3.6'),
      s('M20 16H4.8'),
      s('M8.4 12.4 4.8 16l3.6 3.6'),
    ],
  },
  ArrowUpDown: {
    line: [
      s('M7.4 4.2v15.6'),
      s('M3.8 7.8l3.6-3.6 3.6 3.6'),
      s('M16.6 19.8V4.2'),
      s('M13 16.2l3.6 3.6 3.6-3.6'),
    ],
  },
  Trash: {
    line: [
      s('M3.8 6.4h16.4'),
      s('M9 6.4V4.6c0-.6.4-1 1-1h4c.6 0 1 .4 1 1v1.8'),
      s('M6 6.4l.9 12.8c.1.9.8 1.6 1.7 1.6h6.8c.9 0 1.6-.7 1.7-1.6L18 6.4'),
      s('M10 10.4v6.4'),
      s('M14 10.4v6.4'),
    ],
  },
  X: {line: [s('M5.6 5.6l12.8 12.8'), s('M18.4 5.6 5.6 18.4')]},
  Plus: {line: [s('M12 4.2v15.6'), s('M4.2 12h15.6')]},
  Minus: {line: [s('M4.2 12h15.6')]},
  Check: {line: [s('M4.6 12.6l4.9 4.9L19.6 7.4')]},
  ChevronDown: {line: [s('M5.6 8.8 12 15.2l6.4-6.4')]},
  ChevronUp: {line: [s('M5.6 15.2 12 8.8l6.4 6.4')]},
  ChevronLeft: {line: [s('M15.2 5.6 8.8 12l6.4 6.4')]},
  ChevronRight: {line: [s('M8.8 5.6l6.4 6.4-6.4 6.4')]},
  Pencil: {
    line: [
      s(
        'M4 20l.9-4.4L15.6 4.9a1.9 1.9 0 0 1 2.7 0l.8.8a1.9 1.9 0 0 1 0 2.7L8.4 19.1Z',
      ),
      s('M13.6 6.9l3.5 3.5'),
    ],
  },
  ImagePlus: {
    line: [
      s(
        'M20.2 13v5.4c0 1-.8 1.8-1.8 1.8H5.6c-1 0-1.8-.8-1.8-1.8V5.6c0-1 .8-1.8 1.8-1.8h5.6',
      ),
      s('M3.8 16.6l4.4-4.4 3.6 3.6 2-2 6.2 6.2'),
      f(circle(8.6, 8.6, 1.5)),
      s('M18 2.6v7'),
      s('M14.5 6.1h7'),
    ],
  },
  Link: {
    line: [
      s('M10.2 13.8a4.2 4.2 0 0 0 5.9 0l3-3a4.2 4.2 0 0 0-5.9-5.9l-1 1'),
      s('M13.8 10.2a4.2 4.2 0 0 0-5.9 0l-3 3a4.2 4.2 0 0 0 5.9 5.9l1-1'),
    ],
  },
  Clock: {line: [s(circle(12, 12, 9.1)), s('M12 7v5.2l3.4 2.1')]},
  Eye: {
    line: [
      s(
        'M2.4 12S5.9 5.4 12 5.4 21.6 12 21.6 12 18.1 18.6 12 18.6 2.4 12 2.4 12Z',
      ),
      s(circle(12, 12, 3)),
    ],
  },
  RefreshCw: {
    line: [
      s('M19.8 11.2a7.9 7.9 0 0 0-14.3-3.7'),
      s('M4.2 12.8a7.9 7.9 0 0 0 14.3 3.7'),
      s('M5.1 3.2v4.6h4.6'),
      s('M18.9 20.8v-4.6h-4.6'),
    ],
  },
  Loader: {line: [s('M12 3a9 9 0 1 1-9 9', {cap: 'round'})]},
  Square: {line: [s(rrect(3.6, 3.6, 16.8, 16.8, 3))]},
  /** Selected: the box fills, the tick is cut out. */
  CheckSquare: {
    line: [s(rrect(3.6, 3.6, 16.8, 16.8, 3)), s('M7.6 12.3l2.9 2.9 5.9-5.9')],
    solid: [f(rrect(2.7, 2.7, 18.6, 18.6, 3.6) + thick(CHECK, 2.1))],
  },
  SquareX: {
    line: [
      s(rrect(3.6, 3.6, 16.8, 16.8, 3)),
      s('M8.8 8.8l6.4 6.4'),
      s('M15.2 8.8l-6.4 6.4'),
    ],
  },
  AlertTriangle: {
    line: [
      s(
        roundPoly(
          [
            [12, 3.4],
            [21.4, 19.9],
            [2.6, 19.9],
          ],
          1.4,
        ),
      ),
      s('M12 9.4v4.8'),
      f(circle(12, 16.9, 1.1)),
    ],
  },
  WifiOff: {
    line: [
      f(circle(12, 19, 1.4)),
      s('M8.7 15.5a4.8 4.8 0 0 1 6.6 0'),
      s('M5.3 12.1a9.6 9.6 0 0 1 13.4 0'),
      s('M2 8.8a14.4 14.4 0 0 1 20 0'),
      s('M3.4 3.4l17.2 17.2'),
    ],
  },
  HardDrive: {
    line: [
      s(rrect(3.4, 4, 17.2, 16, 2.4)),
      s('M3.4 13.4h17.2'),
      f(circle(7.4, 16.8, 1.05)),
      f(circle(10.8, 16.8, 1.05)),
    ],
  },
  ChartColumn: {
    line: [
      s('M3.8 20.2h16.4'),
      s('M7 16.4v-5'),
      s('M12 16.4V5.6'),
      s('M17 16.4V8.6'),
    ],
  },

  // ---- Music, for placeholders and the equalizer presets
  Note: {
    line: [
      s(circle(9.4, 17.4, 3)),
      s('M12.4 17.4V3.6'),
      s('M12.4 3.6c.8 2.4 3 3.4 5.4 3.6'),
    ],
  },
  Notes: {
    line: [
      s('M8.6 17.6V5.8l11.6-2.4v11.8'),
      s('M8.6 9.8l11.6-2.4'),
      s(circle(6.1, 17.6, 2.5)),
      s(circle(17.7, 15.2, 2.5)),
    ],
  },
  Mic: {
    line: [
      s(rrect(9, 2.6, 6, 11, 3)),
      s('M5.6 11a6.4 6.4 0 0 0 12.8 0'),
      s('M12 17.4v4'),
      s('M8.6 21.4h6.8'),
    ],
  },
  AudioLines: {
    line: [
      s('M3.2 10v4'),
      s('M7.6 6.2v11.6'),
      s('M12 3v18'),
      s('M16.4 7.4v9.2'),
      s('M20.8 10.4v3.2'),
    ],
  },
  SlidersHorizontal: {
    line: [
      s('M3 7h9'),
      s('M16.6 7H21'),
      s('M3 17h3.4'),
      s('M10.8 17H21'),
      s(circle(14.3, 7, 2.3)),
      s(circle(8.6, 17, 2.3)),
    ],
  },
  Guitar: {
    line: [
      s(
        'M13 11c1.5 1.5.6 3.3-.7 3.8.6 2.8-1 6.1-4.7 6.1-3 0-4.5-1.5-4.5-4.5 0-3.7 3.3-5.3 6.1-4.7.5-1.3 2.3-2.2 3.8-.7Z',
      ),
      f(circle(8.4, 15.6, 1.4)),
      s('M13.9 10.1 20 4'),
      s('M18.4 2.6l3 3'),
    ],
  },
  Piano: {
    line: [
      s(rrect(3.2, 4, 17.6, 16, 2.2)),
      s('M9.1 13.4V20'),
      s('M14.9 13.4V20'),
      f(rrect(7.6, 4, 3, 9.4, 0.6)),
      f(rrect(13.4, 4, 3, 9.4, 0.6)),
    ],
  },
  Drum: {
    line: [
      s('M3.6 9.4c0-1.7 3.8-3 8.4-3s8.4 1.3 8.4 3-3.8 3-8.4 3-8.4-1.3-8.4-3Z'),
      s('M3.6 9.4v7.4c0 1.7 3.8 3 8.4 3s8.4-1.3 8.4-3V9.4'),
      s('M9 7.2 6.2 2.6'),
      s('M15 7.2l2.8-4.6'),
    ],
  },
  Flame: {
    line: [
      s(
        'M12 21.4c-3.9 0-6.9-2.7-6.9-6.5 0-3 1.9-5.3 3.5-6.9.4 1.6 1.3 2.7 2.6 3.1C11 7.6 12.6 4.7 15 2.6c.1 3 1.6 4.8 2.8 6.4 1.3 1.7 2.1 3.4 2.1 5.7 0 4-3.1 6.7-7.9 6.7Z',
      ),
    ],
  },
  Sparkles: {
    line: [s(sparkle(10, 13.4, 7.6)), s(sparkle(18.8, 5.2, 2.9))],
    solid: [b(sparkle(10, 13.4, 7.6)), b(sparkle(18.8, 5.2, 2.9))],
  },
  /** Relaxify's pin, upright so it reads at 12px (see PinGlyph). */
  Pin: {
    line: [
      f('M9 2h6v2l-1 1v5l3 3v2H7v-2l3-3V5L9 4V2Z'),
      f(rrect(11.2, 15, 1.6, 7, 0.8)),
    ],
  },
} satisfies Record<string, Glyph>;

export type GlyphName = keyof typeof GLYPHS;

/** The parts to draw for `name` in the given state. */
export function partsOf(name: GlyphName, solid: boolean): Part[] {
  const g: Glyph = GLYPHS[name];
  return solid && g.solid ? g.solid : g.line;
}

/** A standalone SVG string, for the preview sheet, the docs and Figma. */
export function toSvg(
  name: GlyphName,
  {
    solid = false,
    size = 24,
    color = '#000000',
    weight = 1,
  }: {solid?: boolean; size?: number; color?: string; weight?: number} = {},
): string {
  const body = partsOf(name, solid)
    .map(p => {
      const w = STROKE * weight * (p.w ?? 1);
      const fill = p.mode === 'fill' || p.mode === 'both';
      const stroke = p.mode !== 'fill';
      return (
        `<path d="${p.d}"` +
        (fill ? ` fill="${color}" fill-rule="evenodd"` : ' fill="none"') +
        (stroke
          ? ` stroke="${color}" stroke-width="${n(w)}" stroke-linecap="${
              p.cap ?? 'butt'
            }" stroke-linejoin="${p.join ?? 'round'}"`
          : '') +
        '/>'
      );
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${body}</svg>`;
}
