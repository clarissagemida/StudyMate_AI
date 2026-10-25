export const CHUNK_SIZE = 1200;
export const CHUNK_OVERLAP = 150;
export const MAX_CHUNKS = 40;

function findBreakPoint(text: string, start: number, end: number): number {
  const minimum = start + Math.floor((end - start) * 0.6);

  for (let index = end; index > minimum; index -= 1) {
    const char = text[index - 1];
    if (char === "\n" || char === " " || char === ".") return index;
  }

  return end;
}

// Splits study material into overlapping windows for embedding. Windows break
// near newlines/words so citations contain readable passages.
export function chunkText(
  text: string,
  options: {
    size?: number;
    overlap?: number;
    maxChunks?: number;
  } = {},
): string[] {
  const size = Math.max(200, options.size ?? CHUNK_SIZE);
  const overlap = Math.max(0, Math.min(options.overlap ?? CHUNK_OVERLAP, size - 1));
  const maxChunks = Math.max(1, options.maxChunks ?? MAX_CHUNKS);
  const normalized = text.replace(/\r\n/g, "\n").trim();

  if (!normalized) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length && chunks.length < maxChunks) {
    const hardEnd = Math.min(start + size, normalized.length);
    const end =
      hardEnd < normalized.length ? findBreakPoint(normalized, start, hardEnd) : hardEnd;
    const chunk = normalized.slice(start, end).trim();

    if (chunk) chunks.push(chunk);

    if (end >= normalized.length) break;

    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}
