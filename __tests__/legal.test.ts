/**
 * The legal text's one bit of markup (**bold**) splits the same way for the
 * app and the docs, and the credit names all three sources.
 */
import {expect, test} from '@jest/globals';
import {CREDITS, PRIVACY, TERMS, boldRuns} from '../src/legal';

test('bold runs split around **markers**', () => {
  expect(boldRuns('Plays **JioSaavn** and **YouTube**.')).toEqual([
    {text: 'Plays ', bold: false},
    {text: 'JioSaavn', bold: true},
    {text: ' and ', bold: false},
    {text: 'YouTube', bold: true},
    {text: '.', bold: false},
  ]);
});

test('credits and both statements are complete', () => {
  expect(CREDITS).toBe(
    'Music from JioSaavn, SoundCloud and YouTube. Relaxify is not affiliated with them. For educational and personal use.',
  );
  for (const doc of [TERMS, PRIVACY]) {
    expect(doc.sections.length).toBeGreaterThan(5);
    for (const s of doc.sections) {
      expect((s.paras?.length ?? 0) + (s.list?.length ?? 0)).toBeGreaterThan(0);
    }
  }
});
