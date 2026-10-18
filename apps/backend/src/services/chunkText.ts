export function splitIntoChunks(text: string, size = 900, overlap = 120): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const chunks: string[] = [];
  for (let start = 0; start < clean.length; start += size - overlap) {
    const chunk = clean.slice(start, start + size).trim();
    if (chunk) chunks.push(chunk);
  }

  return chunks;
}
