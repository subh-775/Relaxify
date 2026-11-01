/**
 * POST calls get what apiGet always had: a timeout, because React Native's fetch
 * has none, and the check for an engine that has died. Search spun forever
 * without them, and it is the first thing a person tries.
 */
import {afterEach, beforeEach, expect, jest, test} from '@jest/globals';
import {search} from '../src/backend';

const mockToast = jest.fn();
jest.mock('../src/toast', () => ({toast: (...a: unknown[]) => mockToast(...a)}));
jest.mock('react-native', () => ({
  NativeModules: {Backend: {port: 8771, token: 't'}},
}));
jest.mock('../src/tracks', () => ({getBestArtworkUrl: () => ''}));

beforeEach(() => {
  jest.useFakeTimers();
  mockToast.mockClear();
});
afterEach(() => {
  jest.useRealTimers();
});

test('a search the engine never answers gives up', async () => {
  (globalThis as {fetch?: unknown}).fetch = (_: unknown, init: RequestInit) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });

  const pending = search('anything').then(
    () => 'answered',
    () => 'gave up',
  );
  await jest.advanceTimersByTimeAsync(31_000);

  expect(await pending).toBe('gave up');
  // A timeout is a slow engine, not a dead one.
  expect(mockToast).not.toHaveBeenCalled();
});

test('a search that fails because the engine died says so', async () => {
  (globalThis as {fetch?: unknown}).fetch = async () => {
    throw new Error('ECONNREFUSED');
  };

  await search('anything').catch(() => {});
  await jest.advanceTimersByTimeAsync(6000);

  expect(mockToast).toHaveBeenCalledWith(
    expect.stringContaining('music engine stopped'),
  );
});
