import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  ApiError,
  deleteDocument,
  downloadDocument,
  getDocument,
  listDocuments
} from '../api/client';
import type { DocumentDetail, DocumentMeta } from '../types';
import type { RootOutletContext } from '../router';
import { formatBytes, formatDate } from '../format';
import UploadForm from '../components/UploadForm';
import DocumentChunks, { MatchExcerpt } from '../components/DocumentChunks';
import { IconChevron, IconDownload, IconFile, IconHamburger, IconTrash } from '../components/icons';

const SEARCH_DEBOUNCE_MS = 250;

export default function DocumentsPage() {
  const { onUnauthorized, onToggleSidebar, sidebarVisible } = useOutletContext<RootOutletContext>();
  const [documents, setDocuments] = useState<DocumentMeta[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  // Debounce the search box: refresh the list after typing settles.
  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setRefreshToken(version => version + 1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(debounceRef.current);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listDocuments(query);
        if (!cancelled) {
          setDocuments(rows);
          setError('');
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          onUnauthorized();
        } else {
          setError(err instanceof ApiError ? err.message : 'Could not load documents.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, refreshToken, onUnauthorized]);

  async function toggleView(doc: DocumentMeta) {
    if (detail?.document.id === doc.id) {
      setDetail(null);
      return;
    }
    setOpeningId(doc.id);
    setError('');
    try {
      setDetail(await getDocument(doc.id));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not open the document.');
      }
    } finally {
      setOpeningId(null);
    }
  }

  async function handleDownload(doc: DocumentMeta) {
    setError('');
    try {
      await downloadDocument(doc);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
      } else {
        setError(err instanceof ApiError ? err.message : 'Download failed.');
      }
    }
  }

  async function handleDelete(doc: DocumentMeta) {
    if (
      !window.confirm(`Delete "${doc.title}"? This removes its chunks and session links too.`)
    ) {
      return;
    }
    setDeletingId(doc.id);
    setError('');
    try {
      await deleteDocument(doc.id);
      setDocuments(prev => (prev ? prev.filter(row => row.id !== doc.id) : prev));
      if (detail?.document.id === doc.id) setDetail(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
      } else {
        setError(err instanceof ApiError ? err.message : 'Delete failed.');
      }
    } finally {
      setDeletingId(null);
    }
  }

  const detailId = detail?.document.id ?? null;

  return (
    <main className="main-pane documents-page">
      <header className="main-header">
        <button
          className="btn btn-ghost btn-icon hamburger"
          aria-label="Toggle sidebar"
          aria-expanded={sidebarVisible}
          onClick={onToggleSidebar}
        >
          <IconHamburger size={18} />
        </button>
        <div className="main-title">Documents</div>
        <div className="header-spacer" />
        <span className="model-badge">
          {documents === null ? '…' : `${documents.length} indexed`}
        </span>
      </header>

      <div className="documents-scroll">
        <div className="documents-inner">
          <section className="documents-box" aria-label="Upload a document">
            <div className="documents-head">
              <h3>Add a document</h3>
            </div>
            <UploadForm
              onUploaded={() => setRefreshToken(version => version + 1)}
              onUnauthorized={onUnauthorized}
            />
          </section>

          <section className="documents-box" aria-label="Document library">
            <div className="documents-head">
              <h3>Library</h3>
              <input
                className="input doc-search"
                type="search"
                placeholder="Search title or content…"
                aria-label="Search documents by title or content"
                value={query}
                onChange={event => setQuery(event.target.value)}
              />
            </div>

            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}

            {documents === null ? (
              <p className="empty-note">Loading documents…</p>
            ) : documents.length === 0 ? (
              <p className="empty-note">
                {query
                  ? `No documents match "${query}".`
                  : 'No documents yet. Upload a PDF or TXT file to get started.'}
              </p>
            ) : (
              <ul className="document-list">
                {documents.map(doc => {
                  const expanded = detailId === doc.id;
                  return (
                    <li key={doc.id} className="document-item doc-page-item">
                      <div className="doc-row">
                        <span className="document-icon" aria-hidden="true">
                          <IconFile size={18} />
                        </span>
                        <div className="document-info">
                          <span className="document-title" title={doc.title}>
                            {doc.title}
                          </span>
                          <span className="document-meta">
                            {formatBytes(Number(doc.byte_size))} ·{' '}
                            {Number(doc.chunk_count ?? 0)} chunk
                            {Number(doc.chunk_count ?? 0) === 1 ? '' : 's'} ·{' '}
                            {formatDate(doc.created_at)}
                          </span>
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
                          <button
                            className="btn btn-ghost btn-icon"
                            aria-label={`Download ${doc.title}`}
                            title="Download"
                            onClick={() => handleDownload(doc)}
                          >
                            <IconDownload size={15} />
                          </button>
                          <button
                            className="btn btn-danger-ghost btn-icon"
                            aria-label={`Delete ${doc.title}`}
                            title="Delete"
                            disabled={deletingId === doc.id}
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
                        <DocumentChunks
                          detail={detail}
                          label={`Contents of ${doc.title}`}
                        />
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
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
