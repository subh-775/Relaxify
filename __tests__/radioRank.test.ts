import {describe, expect, it} from '@jest/globals';

import {artistKey, nudge, rankRadio, type Signals} from '../src/radioRank';
import type {Track} from '../src/backend';
import {getDownloadKey} from '../src/tracks';

const t = (title: string, artist: string): Track =>
  ({title, artist, sources: {}} as unknown as Track);

const none = (): Signals => ({
  songs: {},
  artists: {},
  liked: new Set(),
  likedArtists: new Set(),
  artistPlays: {},
  recent: new Set(),
  skippedNow: new Set(),
});

const picks = [
  t('Yellow', 'Coldplay'),
  t('505', 'Arctic Monkeys'),
  t('Iris', 'Goo Goo Dolls'),
  t('Wonderwall', 'Oasis'),
  t('Zombie', 'The Cranberries'),
];
const titles = (list: Track[]) => list.map(x => x.title);

describe('rankRadio', () => {
  it("keeps the recommenders' order for a listener it knows nothing of", () => {
    expect(titles(rankRadio(picks, none()))).toEqual(titles(picks));
  });

  it('leaves out a song skipped again and again', () => {
    const sig = none();
    sig.songs[getDownloadKey(picks[1])] = {s: 2, f: 0, last: 0};
    expect(titles(rankRadio(picks, sig))).not.toContain('505');
  });

  it('keeps a song skipped once but heard through more often', () => {
    const sig = none();
    sig.songs[getDownloadKey(picks[1])] = {s: 2, f: 3, last: 0};
    expect(titles(rankRadio(picks, sig))).toContain('505');
  });

  it('brings a liked, often played artist forward, a few places at most', () => {
    const sig = none();
    sig.likedArtists.add('the cranberries');
    sig.artistPlays['the cranberries'] = 40;
    const ranked = titles(rankRadio(picks, sig));
    expect(ranked.indexOf('Zombie')).toBeLessThan(4);
    // Not over everything: a nudge, not the listener's top ten.
    const long = [...Array(20)].map((_, i) => t(`Song ${i}`, `Artist ${i}`));
    const far = [...long, t('Zombie', 'The Cranberries')];
    expect(titles(rankRadio(far, sig)).indexOf('Zombie')).toBeGreaterThan(5);
  });

  it('pushes back an artist the listener keeps skipping', () => {
    const sig = none();
    sig.artists.coldplay = {s: 4, f: 0, last: 0};
    expect(titles(rankRadio(picks, sig)).indexOf('Yellow')).toBeGreaterThan(2);
  });

  it('holds back an artist skipped in this sitting, however loved', () => {
    const sig = none();
    sig.likedArtists.add('coldplay');
    sig.skippedNow.add('coldplay');
    expect(titles(rankRadio(picks, sig)).slice(-1)).toEqual(['Yellow']);
  });

  it('a duet is judged by the artist the listener knows best', () => {
    const sig = none();
    sig.artists['arijit singh'] = {s: 0, f: 4, last: 0};
    const duet = t('Heeriye', 'Jasleen Royal, Arijit Singh');
    expect(nudge(duet, sig)).toBeGreaterThan(0);
  });

  it('puts the songs played lately at the back, not out', () => {
    const sig = none();
    sig.recent.add(getDownloadKey(picks[0]));
    const ranked = titles(rankRadio(picks, sig));
    expect(ranked[ranked.length - 1]).toBe('Yellow');
  });

  it('a song two seeds agree on comes forward', () => {
    const ranked = rankRadio(picks, none(), {
      [getDownloadKey(picks[3])]: 4,
    });
    expect(titles(ranked).indexOf('Wonderwall')).toBeLessThan(2);
  });

  it('lets two of eight share an artist, however their name is written', () => {
    const many = [
      t('A', 'Kaneko Ayano'),
      t('B', 'kanekoayano'),
      t('C', 'Kaneko Ayano'),
      t('D', 'Vaundy'),
      t('E', 'KANEKO AYANO'),
      t('F', 'never young beach'),
    ];
    const ranked = titles(rankRadio(many, none()));
    expect(ranked.slice(0, 4)).toEqual(['A', 'B', 'D', 'F']);
    // The rest wait behind, not out.
    expect(ranked).toHaveLength(6);
    expect(artistKey('Kaneko Ayano')).toBe(artistKey('kanekoayano'));
  });
});
