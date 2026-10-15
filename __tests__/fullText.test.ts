/**
 * Titles arrive HTML-encoded, sometimes twice, sometimes half-encoded. The
 * players show them whole; lists still strip the "(Official Video)" noise.
 */
import {expect, test} from '@jest/globals';
import {cleanText, decodeEntities, fullText} from '../src/tracks';

test('entities decode, once or twice encoded, with or without the semicolon', () => {
  expect(decodeEntities('Say &quot;Hi&quot;')).toBe('Say "Hi"');
  expect(decodeEntities('Say &amp;quot;Hi&amp;quot;')).toBe('Say "Hi"');
  expect(decodeEntities('Rock &amp Roll')).toBe('Rock & Roll');
  expect(decodeEntities('Don&#39;t &#x2014; Stop')).toBe("Don't — Stop");
  expect(decodeEntities('Tum Hi Ho &ndash; Live')).toBe('Tum Hi Ho – Live');
});

test('a quote that lost its ampersand is still a quote', () => {
  expect(decodeEntities('quot;Hello quot;')).toBe('"Hello "');
  expect(decodeEntities('(From quot;Animalquot;)')).toBe('(From "Animal")');
});

test('ampersands that are not entities survive', () => {
  expect(decodeEntities('R&B Mix')).toBe('R&B Mix');
  expect(decodeEntities('AT&T &amplifier')).toBe('AT&T &amplifier');
  expect(decodeEntities('Quotation')).toBe('Quotation');
});

test('the full title keeps what the list title drops', () => {
  const raw = 'Kesariya &quot;Live&quot; | Full HD Video';
  expect(fullText(raw)).toBe('Kesariya "Live" | Full HD Video');
  expect(cleanText(raw)).toBe('Kesariya "Live"');
  expect(fullText('  Song   â€™s  ')).toBe("Song 's");
  expect(fullText(null)).toBe('');
});
