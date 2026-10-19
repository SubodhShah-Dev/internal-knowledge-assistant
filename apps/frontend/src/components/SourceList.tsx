import type { Source } from '../types';

type Props = {
  sources: Source[];
};

export default function SourceList({ sources }: Props) {
  if (sources.length === 0) return null;
  return (
    <div className="sources-box" data-testid="sources">
      <h3>Supporting excerpts</h3>
      <p className="muted">Verify the answer against these excerpts from your documents.</p>
      {sources.map(source => (
        <div key={source.label} className="source-item">
          <strong>{source.label}</strong> · {source.title} · Chunk {source.chunkIndex}
          <p>{source.excerpt}</p>
        </div>
      ))}
    </div>
  );
}
