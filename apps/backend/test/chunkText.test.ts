import { splitIntoChunks } from '../src/services/chunkText';

test('splits text, respects size, and overlaps adjacent chunks', () => {
  const chunks = splitIntoChunks('a'.repeat(250), 100, 20);
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.every(c => c.length <= 100)).toBe(true);
  expect(chunks[0].slice(-20)).toBe(chunks[1].slice(0, 20));
});

test('returns empty array for whitespace-only input', () => {
  expect(splitIntoChunks('   \n\t  ')).toEqual([]);
});

test('returns a single chunk for short text', () => {
  const chunks = splitIntoChunks('Short policy text.', 900, 120);
  expect(chunks).toEqual(['Short policy text.']);
});

test('collapses whitespace before chunking', () => {
  const chunks = splitIntoChunks('a\n\n  b\t c', 100, 20);
  expect(chunks).toEqual(['a b c']);
});

test('zero overlap loses no non-whitespace characters across chunks', () => {
  const text = 'The quick brown fox jumps over the lazy dog. '.repeat(10);
  const chunks = splitIntoChunks(text, 100, 0);
  const collapsed = text.replace(/\s+/g, ' ').trim();
  // Chunk-boundary .trim() may drop a single space, but no real characters.
  expect(chunks.join('').replace(/ /g, '')).toHaveLength(collapsed.replace(/ /g, '').length);
  expect(chunks.every(c => c.length <= 100)).toBe(true);
});
