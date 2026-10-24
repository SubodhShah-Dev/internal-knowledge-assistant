import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, attachDocument, deleteDocument, detachDocument, downloadDocument, listDocuments } from '../api/client';
import type { DocumentMeta } from '../types';
import UploadForm from './UploadForm';
import DocumentList from './DocumentList';
import { IconClose, IconDownload, IconFile, IconRefresh, IconTrash } from './icons';

type Props = {
  open: boolean;
  refreshToken: number;
  conversationId: number | null;
  attachedDocIds: string[];
  onAttach: (documentId: string) => void;
  onDetach: (documentId: string) => void;
  onClose: () => void;
  onUploaded: () => void;
  onUnauthorized: () => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsModal({
  open,
  refreshToken,
  conversationId,
  attachedDocIds,
  onAttach,
  onDetach,
  onClose,
  onUploaded,
  onUnauthorized
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [allDocuments, setAllDocuments] = useState<DocumentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const docs = await listDocuments();
      setAllDocuments(docs);
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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  const attachedDocuments = allDocuments.filter(doc => attachedDocIds.includes(doc.id));
  const libraryDocuments = allDocuments.filter(doc => !attachedDocIds.includes(doc.id));

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

  async function handleDelete(doc: DocumentMeta) {
    if (!window.confirm(`Delete "${doc.title}"? This removes its chunks and session links too.`)) return;
    setError('');
    try {
      await deleteDocument(doc.id);
      setAllDocuments(prev => prev.filter(d => d.id !== doc.id));
      onDetach(doc.id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      setError(err instanceof ApiError ? err.message : 'Delete failed.');
    }
  }

  return (
    <dialog className="modal" ref={dialogRef} aria-label="Documents">
      <div className="modal-card">
        <div className="modal-head">
          <h2>Documents</h2>
          <button className="btn btn-ghost btn-icon" aria-label="Close documents" onClick={onClose}>
            <IconClose size={17} />
          </button>
        </div>
        <div className="modal-body">
          {error && (
            <p className="error-text" role="alert">{error}</p>
          )}

          {/* ---------- In this session ---------- */}
          <div className="documents-box">
            <div className="documents-head">
              <h3>In this session</h3>
              {conversationId === null && (
                <span className="empty-note" style={{ fontSize: '12px', color: 'var(--text-faint)' }}>
                  Attached docs will be saved when you ask your first question.
                </span>
              )}
            </div>
            {loading && attachedDocuments.length === 0 && (
              <p className="empty-note">Loading attached documents…</p>
            )}
            {!loading && attachedDocuments.length === 0 && (
              <p className="empty-note">No documents attached yet.</p>
            )}
            <ul className="document-list">
              {attachedDocuments.map(doc => (
                <li key={doc.id} className="document-item">
                  <span className="document-icon">
                    <IconFile size={18} />
                  </span>
                  <div className="document-info">
                    <div className="document-title">{doc.title}</div>
                    <div className="document-meta">
                      {doc.original_name} · {formatBytes(doc.byte_size)}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-icon"
                    aria-label={`Detach ${doc.title}`}
                    onClick={() => onDetach(doc.id)}
                  >
                    <IconClose size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* ---------- Library ---------- */}
          <div className="documents-box" style={{ marginTop: 'var(--space-5)' }}>
            <div className="documents-head">
              <h3>Library</h3>
              <button
                className="btn btn-ghost"
                onClick={load}
                disabled={loading}
                aria-label="Refresh documents"
              >
                <IconRefresh size={15} />
              </button>
            </div>
            {!loading && libraryDocuments.length === 0 && !error && (
              <p className="empty-note">No documents in library. Upload a PDF or TXT file to get started.</p>
            )}
            <UploadForm onUploaded={onUploaded} onUnauthorized={onUnauthorized} />
            <ul className="document-list">
              {libraryDocuments.map(doc => (
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
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button
                      className="btn btn-ghost btn-icon"
                      aria-label={`Attach ${doc.title} to session`}
                      onClick={() => onAttach(doc.id)}
                    >
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>+</span>
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => handleDownload(doc)}
                      disabled={downloadingId === doc.id}
                      aria-label={`Download ${doc.original_name}`}
                    >
                      <IconDownload size={16} />
                      {downloadingId === doc.id ? '…' : 'Download'}
                    </button>
                    <button
                      className="btn btn-danger-ghost btn-icon"
                      aria-label={`Delete ${doc.title}`}
                      onClick={() => handleDelete(doc)}
                    >
                      <IconTrash size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </dialog>
  );
}
