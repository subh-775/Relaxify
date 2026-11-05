/**
 * A recommended song taken out of the queue is "not this one": the radio
 * leaves it out next time and pushes its artist down, without banning them.
 */
import {describe, expect, it, jest} from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
}));

import {noteDismissed, radioSignals} from '../src/taste';
import {rankRadio} from '../src/radioRank';
import type {Track} from '../src/backend';

const t = (title: string, artist: string): Track =>
  ({title, artist, sources: {}} as unknown as Track);

describe('noteDismissed', () => {
  it('drops the song from the next radio batch, and only that song', () => {
    const picks = [
      t('Yellow', 'Coldplay'),
      t('505', 'Arctic Monkeys'),
      t('Fix You', 'Coldplay'),
      t('Wonderwall', 'Oasis'),
    ];
    noteDismissed(picks[1]);
    const titles = rankRadio(picks, radioSignals()).map(x => x.title);
    expect(titles).not.toContain('505');
    expect(titles).toEqual(expect.arrayContaining(['Yellow', 'Wonderwall']));
  });

  it("puts the artist's other songs after everyone else's", () => {
    noteDismissed(t('Clocks', 'Keane'));
    const picks = [t('Somewhere Only We Know', 'Keane'), t('Creep', 'Radiohead')];
    const titles = rankRadio(picks, radioSignals()).map(x => x.title);
    expect(titles).toEqual(['Creep', 'Somewhere Only We Know']);
  });

  it('ignores a track with no title', () => {
    expect(() => noteDismissed(t('', 'Nobody'))).not.toThrow();
  });
});
