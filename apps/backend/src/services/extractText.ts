import { PDFParse } from 'pdf-parse';

export async function extractText(buffer: Buffer, ext: '.pdf' | '.txt'): Promise<string> {
  if (ext === '.txt') {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    if (text.includes('\u0000')) {
      throw new Error('TXT upload contains binary data.');
    }
    return text.trim();
  }

  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text.trim();
  } finally {
    await parser.destroy();
  }
}
