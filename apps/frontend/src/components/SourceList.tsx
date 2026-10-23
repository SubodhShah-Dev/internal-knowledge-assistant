import type { Source } from '../types';

type Props = {
  sources: Source[];
};

export default function SourceList({ sources }: Props) {
  if (sources.length === 0) return null;
  return (
    <div data-testid="sources">
      <div className="source-list">
        {sources.map(source => (
          <div key={source.label} className="source-item">
            <div className="source-head">
              <span className="source-label">{source.label}</span>
              <span className="source-title">{source.title}</span>
              <span>chunk {source.chunkIndex}</span>
            </div>
            <p className="source-excerpt">{source.excerpt}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
