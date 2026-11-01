/**
 * The download poll runs every 500 ms and a busy engine can take longer than
 * that to answer. Ticks must not overlap, or one finished download is reported
 * twice: two rescans, and two song_downloaded events.
 */
import {afterEach, beforeEach, expect, jest, test} from '@jest/globals';
import {enqueueDownload} from '../src/downloads';

const mockLog = jest.fn();
jest.mock('../src/analytics', () => ({
  logEvent: (...a: unknown[]) => mockLog(...a),
  songParams: () => ({}),
}));
jest.mock('../src/toast', () => ({toast: () => undefined}));

let mockStatus: () => Promise<unknown> = async () => ({});
jest.mock('../src/backend', () => ({
  apiUrl: (p: string) => p,
  getDownloadStatus: () => mockStatus(),
  startDownload: async () => ({task_id: 't1'}),
}));

beforeEach(() => {
  jest.useFakeTimers();
  mockLog.mockClear();
});
afterEach(() => {
  jest.useRealTimers();
});

test('a slow status call does not double-report the finish', async () => {
  const waiting: Array<(v: unknown) => void> = [];
  mockStatus = () => new Promise(resolve => waiting.push(resolve));

  await enqueueDownload({title: 'Song', artist: 'Someone'} as never);
  await jest.advanceTimersByTimeAsync(2600); // five ticks with the first unanswered

  expect(waiting).toHaveLength(1);
  waiting[0]({status: 'completed', progress: 100});
  await jest.advanceTimersByTimeAsync(600);

  const finished = mockLog.mock.calls.filter(c => c[0] === 'song_downloaded');
  expect(finished).toHaveLength(1);
});
