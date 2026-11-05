import {describe, expect, it, jest} from '@jest/globals';

jest.mock('../src/backend', () => ({importSpotify: jest.fn()}));
jest.mock('../src/analytics', () => ({logEvent: () => undefined}));
jest.mock('../src/toast', () => ({toast: () => undefined}));

import {
  IMPORT_NEWS_MS,
  importIsNews,
  type LastImport,
} from '../src/spotifyImport';

const imported = (over: Partial<LastImport>): LastImport => ({
  url: 'u',
  name: 'My Top Songs 2022',
  image: '',
  playlistId: 'p1',
  found: 96,
  total: 97,
  opened: false,
  ...over,
});

describe("Home's import card", () => {
  const now = 1_000_000_000_000;
  it('announces an import just finished', () => {
    expect(importIsNews(imported({at: now - 60_000}), now)).toBe(true);
  });
  it('goes back to asking once the playlist is opened', () => {
    expect(importIsNews(imported({at: now, opened: true}), now)).toBe(false);
  });
  it('goes back to asking after six hours, opened or not', () => {
    expect(importIsNews(imported({at: now - IMPORT_NEWS_MS - 1}), now)).toBe(
      false,
    );
  });
  it('does not announce an import from before the time was kept', () => {
    expect(importIsNews(imported({}), now)).toBe(false);
  });
  it('announces nothing when there was no import', () => {
    expect(importIsNews(null, now)).toBe(false);
  });
});
