import { useCallback, useEffect, useState } from 'react';
import { ApiError, downloadDocument, listDocuments } from '../api/client';
import type { DocumentMeta } from '../types';
import { IconDownload, IconFile, IconRefresh } from './icons';

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
      <div className="documents-head">
        <h3>Your documents</h3>
        <button className="btn btn-ghost" onClick={load} disabled={loading} aria-label="Refresh documents">
          <IconRefresh size={15} />
        </button>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {loading && documents.length === 0 && <p className="empty-note">Loading documents…</p>}
      {!loading && documents.length === 0 && !error && (
        <p className="empty-note">No documents yet. Upload a PDF or TXT file to get started.</p>
      )}
      <ul className="document-list">
        {documents.map(doc => (
          <li key={doc.id} className="document-item">
            <span className="document-icon">
              <IconFile size={18} />
            </span>
            <div className="document-info">
              <div className="document-title">{doc.title}</div>
              <div className="document-meta">
                {doc.original_name} · {formatBytes(doc.byte_size)} ·{' '}
                {new Date(doc.created_at).toLocaleDateString()}
              </div>
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => handleDownload(doc)}
              disabled={downloadingId === doc.id}
              aria-label={`Download ${doc.original_name}`}
            >
              <IconDownload size={16} />
              {downloadingId === doc.id ? '…' : 'Download'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
