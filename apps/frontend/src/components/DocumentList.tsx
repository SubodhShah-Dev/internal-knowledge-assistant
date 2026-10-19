import { useCallback, useEffect, useState } from 'react';
import { ApiError, downloadDocument, listDocuments } from '../api/client';
import type { DocumentMeta } from '../types';

type Props = {
  refreshToken: number;
  onUnauthorized: () => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentList({ refreshToken, onUnauthorized }: Props) {
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDocuments(await listDocuments());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      setError(err instanceof ApiError ? err.message : 'Could not load documents.');
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  async function handleDownload(doc: DocumentMeta) {
    setDownloadingId(doc.id);
    setError('');
    try {
      await downloadDocument(doc);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      setError(err instanceof ApiError ? err.message : 'Download failed.');
    } finally {
      setDownloadingId('');
    }
  }

  return (
    <div className="documents-box">
      <div className="box-header">
        <h3>Your documents</h3>
        <button className="secondary small" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {loading && documents.length === 0 && <p className="muted">Loading documents…</p>}
      {!loading && documents.length === 0 && !error && (
        <p className="muted">No documents yet. Upload a PDF or TXT file to get started.</p>
      )}
      <ul className="document-list">
        {documents.map(doc => (
          <li key={doc.id} className="document-item">
            <div className="document-meta">
              <strong>{doc.title}</strong>
              <span className="muted">
                {doc.original_name} · {formatBytes(doc.byte_size)} · {new Date(doc.created_at).toLocaleString()}
              </span>
            </div>
            <button
              className="secondary small"
              onClick={() => handleDownload(doc)}
              disabled={downloadingId === doc.id}
            >
              {downloadingId === doc.id ? 'Downloading…' : 'Download'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
