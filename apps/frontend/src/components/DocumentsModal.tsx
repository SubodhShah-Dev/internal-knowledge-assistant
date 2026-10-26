import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  deleteDocument,
  downloadDocument,
  getDocument,
  listDocuments
} from '../api/client';
import type { DocumentDetail, DocumentMeta } from '../types';
import { formatBytes, formatDate } from '../format';
import UploadForm from './UploadForm';
import DocumentChunks, { MatchExcerpt } from './DocumentChunks';
import { IconChevron, IconClose, IconDownload, IconFile, IconPlus, IconRefresh, IconTrash } from './icons';

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

const SEARCH_DEBOUNCE_MS = 250;

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
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);

  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    // Only the newest request may update the list, otherwise a slow earlier
    // response can overwrite the results of a newer search.
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const docs = await listDocuments(activeQuery);
      if (requestId !== requestIdRef.current) return;
      setAllDocuments(docs);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      setError(err instanceof ApiError ? err.message : 'Could not load documents.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [onUnauthorized, activeQuery]);

  // Debounce the search box so we do not query on every keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setActiveQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

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
  const detailId = detail?.document.id ?? null;

  async function toggleView(doc: DocumentMeta) {
    if (detailId === doc.id) {
      setDetail(null);
      return;
    }
    setOpeningId(doc.id);
    setError('');
    try {
      setDetail(await getDocument(doc.id));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      setError(err instanceof ApiError ? err.message : 'Could not open the document.');
    } finally {
      setOpeningId(null);
    }
  }

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
      if (detailId === doc.id) setDetail(null);
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

          {/* ---------- Documents (searchable, attached state shown per row) ---------- */}
          <div className="documents-box">
            <div className="documents-head">
              <div className="documents-head-text">
                <h3>Documents</h3>
                <p className="doc-session-note">
                  {attachedDocuments.length} attached to this session
                  {conversationId === null ? ' · saved on first question' : ''}
                </p>
              </div>
              <div className="documents-head-actions">
                <input
                  className="input doc-search"
                  type="search"
                  placeholder="Search title or content…"
                  aria-label="Search documents by title or content"
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                />
                <button
                  className="btn btn-ghost btn-icon"
                  onClick={load}
                  disabled={loading}
                  aria-label="Refresh documents"
                  title="Refresh"
                >
                  <IconRefresh size={15} />
                </button>
              </div>
            </div>
            <UploadForm onUploaded={onUploaded} onUnauthorized={onUnauthorized} />
            {!loading && allDocuments.length === 0 && !error && (
              <p className="empty-note">
                {activeQuery
                  ? `No documents match "${activeQuery}".`
                  : 'No documents yet. Upload a PDF or TXT file to get started.'}
              </p>
            )}
            <ul className="document-list">
              {allDocuments.map(doc => {
                const expanded = detailId === doc.id;
                const attached = attachedDocIds.includes(doc.id);
                return (
                  <li key={doc.id} className="document-item doc-page-item">
                    <div className="doc-row">
                      <span className="document-icon" aria-hidden="true">
                        <IconFile size={18} />
                      </span>
                      <div className="document-info">
                        <div className="doc-title-line">
                          <span className="document-title" title={doc.title}>{doc.title}</span>
                          {attached && <span className="badge badge-attached">Attached</span>}
                        </div>
                        <div className="document-meta">
                          {doc.original_name} · {formatBytes(Number(doc.byte_size))} ·{' '}
                          {Number(doc.chunk_count ?? 0)} chunk
                          {Number(doc.chunk_count ?? 0) === 1 ? '' : 's'} ·{' '}
                          {formatDate(doc.created_at)}
                        </div>
                      </div>
                      <div className="doc-actions">
                        <button
                          className="btn btn-ghost btn-icon"
                          aria-label={`${expanded ? 'Hide' : 'View'} ${doc.title}`}
                          aria-expanded={expanded}
                          title={expanded ? 'Hide contents' : 'View contents'}
                          onClick={() => toggleView(doc)}
                        >
                          <span className={`doc-chevron${expanded ? ' open' : ''}`}>
                            <IconChevron size={15} />
                          </span>
                        </button>
                        {attached ? (
                          <button
                            className="btn btn-ghost btn-icon"
                            aria-label={`Detach ${doc.title}`}
                            title="Detach from this session"
                            onClick={() => onDetach(doc.id)}
                          >
                            <IconClose size={16} />
                          </button>
                        ) : (
                          <button
                            className="btn btn-ghost btn-icon"
                            aria-label={`Attach ${doc.title} to session`}
                            title="Attach to this session"
                            onClick={() => onAttach(doc.id)}
                          >
                            <IconPlus size={15} />
                          </button>
                        )}
                        <button
                          className="btn btn-ghost btn-icon"
                          aria-label={`Download ${doc.original_name}`}
                          title="Download"
                          disabled={downloadingId === doc.id}
                          onClick={() => handleDownload(doc)}
                        >
                          <IconDownload size={15} />
                        </button>
                        <button
                          className="btn btn-danger-ghost btn-icon"
                          aria-label={`Delete ${doc.title}`}
                          title="Delete"
                          onClick={() => handleDelete(doc)}
                        >
                          <IconTrash size={15} />
                        </button>
                      </div>
                    </div>

                    {doc.match_excerpt && (
                      <p className="doc-match">
                        <MatchExcerpt text={doc.match_excerpt} />
                      </p>
                    )}

                    {expanded && detail && (
                      <DocumentChunks detail={detail} label={`Contents of ${doc.title}`} />
                    )}
                    {openingId === doc.id && (
                      <p className="empty-note" role="status">
                        Opening contents…
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </dialog>
  );
}
