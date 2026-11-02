/**
 * Android files voice notes and ringtones as audio too, and a song this app
 * downloaded is in its media library as well. On this phone holds neither.
 */
import {beforeEach, expect, jest, test} from '@jest/globals';

const mockSongs: any[] = [];
jest.mock('react-native', () => ({
  NativeModules: {Device: {localMusic: async () => mockSongs}},
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
}));

import {setLocalFiles} from '../src/localFiles';
import {
  readLocalMusic,
  refreshLocalMusic,
  toLocalTrack,
} from '../src/localMusic';

const song = (over = {}) => ({
  title: 'Mine',
  artist: 'Me',
  duration_ms: 200000,
  file_path: '/storage/emulated/0/Music/mine.mp3',
  ...over,
});

beforeEach(() => {
  mockSongs.length = 0;
  setLocalFiles([]);
});

test('a song is marked as the person own file', () => {
  expect(toLocalTrack(song())?.on_device).toBe(true);
});

test('a short clip is not a song', () => {
  expect(toLocalTrack(song({duration_ms: 12000}))).toBeNull();
});

test.each([
  '/storage/emulated/0/WhatsApp/Media/WhatsApp Audio/AUD-1.opus',
  '/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/a.m4a',
  '/storage/emulated/0/Recordings/Voice/rec.m4a',
  '/storage/emulated/0/Notifications/ding.mp3',
  '/storage/emulated/0/Telegram/Telegram Audio/t.mp3',
])('%s is not music', file_path => {
  expect(toLocalTrack(song({file_path}))).toBeNull();
});

test('a nameless file still gets a title', () => {
  expect(toLocalTrack(song({title: ''}))?.title).toBe('Unknown song');
});

test('a download is not listed twice', async () => {
  const path = '/storage/emulated/0/Download/Relaxify/music/a.m4a';
  mockSongs.push(song(), song({file_path: path}));
  setLocalFiles([{title: 'a', artist: 'b', file_path: path} as any]);
  await refreshLocalMusic();
  expect(readLocalMusic().map(t => t.title)).toEqual(['Mine']);
});
