import {describe, expect, it} from '@jest/globals';

import {importKey} from '../src/spotifyImport';

describe('importKey', () => {
  it('names one Spotify playlist however its link was copied', () => {
    const k = importKey('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');
    expect(
      importKey('https://open.spotify.com/intl-in/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123'),
    ).toBe(k);
    expect(importKey('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M')).toBe(k);
  });

  it('tells a playlist from an album with the same id', () => {
    expect(importKey('https://open.spotify.com/album/X1')).not.toBe(
      importKey('https://open.spotify.com/playlist/X1'),
    );
  });

  it('names one YouTube list across hosts and extra params', () => {
    const k = importKey('https://www.youtube.com/playlist?list=PL123abc');
    expect(importKey('https://music.youtube.com/playlist?list=PL123abc&si=x')).toBe(k);
    expect(importKey('https://m.youtube.com/watch?v=abc&list=PL123abc')).toBe(k);
  });

  it('keeps two different lists apart', () => {
    expect(importKey('https://open.spotify.com/playlist/A1')).not.toBe(
      importKey('https://open.spotify.com/playlist/B2'),
    );
  });
});
