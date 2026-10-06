/**
 * The equalizer's curve has to pass THROUGH every knob, not near it: a line
 * that misses the knobs reads as a second, disagreeing control. And the glow
 * under it has to close on the 0 dB line, the middle of the columns.
 */
import {expect, test} from '@jest/globals';
import {curvePath} from '../src/eq';

const G = {w: 360, padX: 18, h: 170, top: 12, lift: 6.5};
const knobs = (ts: number[]) =>
  ts.map((t, i) => [
    G.padX + (i + 0.5) * ((G.w - 2 * G.padX) / ts.length),
    G.top + G.h * (1 - t) - G.lift,
  ]);
/** Every segment's end point, the M point first. */
const ends = (d: string) =>
  [...d.matchAll(/(?:M|C[^C]*? )(-?[\d.]+),(-?[\d.]+)(?= C|$| L)/g)].map(m => [
    Number(m[1]),
    Number(m[2]),
  ]);

test('the line passes exactly through each knob', () => {
  const ts = [0.875, 0.79, 0.67, 0.54, 0.5, 0.5, 0.5, 0.5]; // Bass Boost
  const got = ends(curvePath(ts, G, false));
  expect(got).toHaveLength(8);
  got.forEach(([x, y], i) => {
    expect(x).toBeCloseTo(knobs(ts)[i][0], 6);
    expect(y).toBeCloseTo(knobs(ts)[i][1], 6);
  });
});

test('the glow closes on 0 dB, and nothing is drawn before the row is measured', () => {
  const ts = [0.5, 0.6, 0.7, 0.6, 0.5, 0.4, 0.3, 0.4];
  const zero = G.top + G.h / 2 - G.lift;
  expect(curvePath(ts, G, true).endsWith(`,${zero} Z`)).toBe(true);
  expect(curvePath(ts, {...G, w: 0}, false)).toBe('');
});
