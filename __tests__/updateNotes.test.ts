import {expect, test} from '@jest/globals';
import {formatSize} from '../src/updateNotes';

test('size reads as a download, and an unknown size renders nothing', () => {
  expect(formatSize(49_876_543)).toBe('47.6 MB');
  expect(formatSize(0)).toBe('');
  expect(formatSize(undefined)).toBe('');
});
