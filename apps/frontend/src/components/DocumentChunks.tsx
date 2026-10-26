import type { DocumentDetail } from '../types';

/** ts_headline marks hits as <<term>>; render those as <mark>. */
export function MatchExcerpt({ text }: { text: string }) {
  const parts = text.split(/(<<[^>]*>>)/g).filter(Boolean);
  return (
    <span>
      {parts.map((part, index) =>
        part.startsWith('<<') && part.endsWith('>>') ? (
          <mark key={index}>{part.slice(2, -2)}</mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </span>
  );
}

/** Collapsible view of a document's indexed chunks. */
export default function DocumentChunks({
  detail,
  label = 'Document contents'
}: {
  detail: DocumentDetail;
  label?: string;
}) {
  return (
    <div className="doc-chunks" aria-label={label}>
      <div className="doc-chunks-head">
        {detail.totalChunks} chunk{detail.totalChunks === 1 ? '' : 's'}
        {detail.totalChunks > detail.chunks.length
          ? ` · showing first ${detail.chunks.length}`
          : ''}
      </div>
      {detail.chunks.map(chunk => (
        <details key={chunk.chunk_index} className="doc-chunk">
          <summary>Chunk {chunk.chunk_index + 1}</summary>
          <p>{chunk.content}</p>
        </details>
      ))}
    </div>
  );
}
