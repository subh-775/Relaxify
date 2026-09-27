/**
 * Relaxify's own colours and shapes, shared by the Recap and the everyday
 * screens (the Home teaser, Search's Browse tiles, the empty states), so a
 * change here changes the whole look together.
 *
 * Shapes are plain SVG path strings: react-native-svg draws them as they are.
 */

export const DARK = '#111014';

/** A field, its ink, and three accents. Every accent reads on its field. */
export type Pal = {bg: string; ink: string; a: string; b: string; c: string};

export const PALS: Pal[] = [
  {bg: '#FF5A4E', ink: DARK, a: '#B8FF3C', b: '#7A2CFF', c: '#3CC8FF'},
  {bg: '#A9A3FF', ink: DARK, a: '#FF7A1A', b: '#FF4FB3', c: '#FFE14D'},
  {bg: '#15121C', ink: '#FFFFFF', a: '#2EE6C8', b: '#FF3FA4', c: '#FFD23F'},
  {bg: '#B8F03C', ink: DARK, a: '#6C2BFF', b: '#FF5A4E', c: '#3CC8FF'},
  {bg: '#3CB4FF', ink: DARK, a: '#FFE14D', b: '#FF4FB3', c: '#B8FF3C'},
  {bg: '#FF6FD8', ink: DARK, a: '#1FD1B5', b: '#FFE14D', c: '#6C2BFF'},
  {bg: '#FF9F1C', ink: DARK, a: '#6C2BFF', b: '#3CC8FF', c: '#FF4FB3'},
  {bg: '#1FC3A6', ink: DARK, a: '#FF5A4E', b: '#FFE14D', c: '#6C2BFF'},
];

/** The bright palettes only: for small tiles, where a dark one reads as a hole. */
export const BRIGHT_PALS = PALS.filter(p => p.ink === DARK);

/** A small seeded generator, so each shape keeps its outline between renders. */
export function rng(seed: number): () => number {
  let x = seed * 7919 + 17;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

/** A smooth, wobbly closed blob through n points (Catmull-Rom as cubics). */
export function blob(
  cx: number,
  cy: number,
  r: number,
  wob: number,
  n: number,
  seed: number,
): string {
  const R = rng(seed);
  const p = Array.from({length: n}, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 - wob + R() * wob * 2);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  });
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n];
    const p1 = p[i];
    const p2 = p[(i + 1) % n];
    const p3 = p[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + 'Z';
}

/** A starburst with `spikes` points between radii R and r. */
export function burst(
  cx: number,
  cy: number,
  R: number,
  r: number,
  spikes: number,
): string {
  let d = '';
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r : R;
    const x = (cx + Math.cos(a) * rr).toFixed(1);
    const y = (cy + Math.sin(a) * rr).toFixed(1);
    d += `${i ? 'L' : 'M'}${x},${y}`;
  }
  return d + 'Z';
}

/** A soft four-point sparkle. */
export function sparkle(cx: number, cy: number, r: number): string {
  const k = r * 0.22;
  return (
    `M${cx},${cy - r}Q${cx + k},${cy - k} ${cx + r},${cy}` +
    `Q${cx + k},${cy + k} ${cx},${cy + r}Q${cx - k},${cy + k} ${cx - r},${cy}` +
    `Q${cx - k},${cy - k} ${cx},${cy - r}Z`
  );
}

/** A small pixel-art flower, row by row. */
export const FLOWER = [
  '....XXX....',
  '...X...X...',
  '...X...X...',
  '.XX.X.X.XX.',
  'X..X...X..X',
  'X...XXX...X',
  'X..X...X..X',
  '.XX.X.X.XX.',
  '...X...X...',
  '...X...X...',
  '....XXX....',
];
