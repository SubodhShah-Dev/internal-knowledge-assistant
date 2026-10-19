import fs from 'node:fs';
import path from 'node:path';
import { extractText } from '../src/services/extractText';

const pdfFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample.pdf'));

test('extracts plain text from a TXT buffer', async () => {
  const text = await extractText(Buffer.from('Hello policy world.'), '.txt');
  expect(text).toBe('Hello policy world.');
});

test('strips a UTF-8 BOM from TXT input', async () => {
  const text = await extractText(Buffer.from('\uFEFFVisible after BOM'), '.txt');
  expect(text).toBe('Visible after BOM');
});

test('rejects TXT input containing NUL bytes', async () => {
  await expect(extractText(Buffer.from('abc\u0000def'), '.txt')).rejects.toThrow(/binary data/);
});

test('returns empty string for whitespace-only TXT', async () => {
  await expect(extractText(Buffer.from('   \n  '), '.txt')).resolves.toBe('');
});

test('extracts text from a real PDF buffer', async () => {
  const text = await extractText(pdfFixture, '.pdf');
  expect(text).toContain('Annual leave policy');
  expect(text).toContain('20 days');
});

test('rejects garbage bytes presented as a PDF', async () => {
  await expect(extractText(Buffer.from('this is not a pdf at all'), '.pdf')).rejects.toThrow();
});
