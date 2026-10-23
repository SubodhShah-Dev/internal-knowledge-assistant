import { useRef, useState } from 'react';
import { ApiError, uploadDocument } from '../api/client';

type Props = {
  onUploaded: () => void;
  onUnauthorized: () => void;
};

export default function UploadForm({ onUploaded, onUnauthorized }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (!file) {
      setError('Choose a PDF or TXT file first.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await uploadDocument(file);
      setMessage(
        `Upload complete: ${result.document.title} (${result.chunkCount} chunk${result.chunkCount === 1 ? '' : 's'} indexed).`
      );
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onUploaded();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      setError(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="upload-box">
      <div className="upload-row">
        <label className="file-label" htmlFor="doc-file">
          Document (PDF or TXT, max 10 MB)
        </label>
        <input
          id="doc-file"
          ref={inputRef}
          type="file"
          accept=".pdf,.txt"
          onChange={e => {
            setFile(e.target.files?.[0] ?? null);
            setError('');
            setMessage('');
          }}
        />
      </div>
      <div className="upload-row">
        <button className="btn btn-primary" onClick={handleUpload} disabled={busy || !file}>
          {busy ? 'Uploading…' : 'Upload'}
        </button>
        {message && (
          <p className="success-text" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
