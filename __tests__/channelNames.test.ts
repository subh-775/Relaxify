import {describe, expect, it} from '@jest/globals';

import {cleanText, getTrackId, splitArtists} from '../src/tracks';

describe('YouTube channel names as artists', () => {
  it('drops the " - Topic" of YouTube Music channels', () => {
    expect(cleanText('Natalie Holt - Topic')).toBe('Natalie Holt');
    expect(cleanText('Javed - Mohsin - Topic')).toBe('Javed - Mohsin');
  });

  it('drops VEVO, glued on or spaced', () => {
    expect(cleanText('TaylorSwiftVEVO')).toBe('TaylorSwift');
    expect(cleanText('Coldplay VEVO')).toBe('Coldplay');
  });

  it('leaves names that only contain the words alone', () => {
    expect(cleanText('Topic')).toBe('Topic');
    expect(cleanText('Vevo')).toBe('Vevo');
    expect(cleanText('Vishal-Shekhar')).toBe('Vishal-Shekhar');
  });

  it('makes a saved channel-named song the same song as the clean one', () => {
    expect(getTrackId({title: 'TVA', artist: 'Natalie Holt - Topic'} as never)).toBe(
      getTrackId({title: 'TVA', artist: 'Natalie Holt'} as never),
    );
  });

  it('splits to the artist, not the channel', () => {
    expect(splitArtists('Natalie Holt - Topic')).toEqual(['Natalie Holt']);
  });
});
