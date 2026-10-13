/**
 * The icon set has one drawing per glyph (src/glyphs.ts); the widget and the
 * notification carry copies as Android drawables, written by scripts/icons.js.
 * These fail when a copy goes stale, or when an icon is exported without a
 * drawing behind it.
 */
import {describe, expect, it} from '@jest/globals';
import {readFileSync} from 'fs';
import {join} from 'path';
import {GLYPHS, partsOf, type GlyphName} from '../src/glyphs';
import * as Icons from '../src/icons';

const DRAWABLES = join(__dirname, '../android/app/src/main/res/drawable');

const pathData = (file: string) =>
  [
    ...readFileSync(join(DRAWABLES, file), 'utf8').matchAll(
      /pathData="([^"]+)"/g,
    ),
  ].map(m => m[1]);

describe('glyphs', () => {
  it('draws something for every glyph, in both states', () => {
    for (const name of Object.keys(GLYPHS) as GlyphName[]) {
      expect(partsOf(name, false).length).toBeGreaterThan(0);
      expect(partsOf(name, true).length).toBeGreaterThan(0);
    }
  });

  it('exports exactly one icon per glyph', () => {
    expect(Object.keys(Icons).sort()).toEqual(Object.keys(GLYPHS).sort());
  });

  it.each([
    ['play', 'Play'],
    ['pause', 'Pause'],
    ['next', 'SkipForward'],
    ['prev', 'SkipBack'],
  ] as [string, GlyphName][])(
    'widget and notification %s match the glyph (run scripts/icons.js)',
    (file, glyph) => {
      const want = partsOf(glyph, false).map(p => p.d);
      expect(pathData(`ic_widget_${file}.xml`)).toEqual(want);
      expect(pathData(`ic_notif_${file}.xml`)).toEqual(want);
    },
  );
});
