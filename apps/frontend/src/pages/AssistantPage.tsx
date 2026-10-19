import { useCallback, useState } from 'react';
import { ApiError, askQuestion, clearToken } from '../api/client';
import AnswerCard from '../components/AnswerCard';
import DocumentList from '../components/DocumentList';
import QuestionForm from '../components/QuestionForm';
import UploadForm from '../components/UploadForm';
import type { AskResponse } from '../types';

type Props = {
  email: string;
  onLoggedOut: () => void;
};

export default function AssistantPage({ email, onLoggedOut }: Props) {
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [askError, setAskError] = useState('');
  const [documentsVersion, setDocumentsVersion] = useState(0);

  const handleUnauthorized = useCallback(() => {
    clearToken();
    onLoggedOut();
  }, [onLoggedOut]);

  async function handleAsk() {
    if (!question.trim()) return;
    setAsking(true);
    setAskError('');
    setResult(null);
    try {
      setResult(await askQuestion(question.trim()));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) handleUnauthorized();
      setAskError(err instanceof ApiError ? err.message : 'Asking failed.');
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="card">
        <div className="box-header">
          <div>
            <h1>AI Knowledge Assistant</h1>
            <p className="subtitle">Answers are grounded in excerpts from your own documents.</p>
          </div>
          <div className="user-box">
            <span className="muted">{email}</span>
            <button
              className="secondary"
              onClick={() => {
                clearToken();
                onLoggedOut();
              }}
            >
              Log out
            </button>
          </div>
        </div>

        <UploadForm
          onUploaded={() => setDocumentsVersion(v => v + 1)}
          onUnauthorized={handleUnauthorized}
        />

        <DocumentList refreshToken={documentsVersion} onUnauthorized={handleUnauthorized} />

        <QuestionForm
          value={question}
          busy={asking}
          onChange={setQuestion}
          onSubmit={handleAsk}
        />

        {askError && <p className="error-text" role="alert">{askError}</p>}

        {result && (
          <AnswerCard
            answer={result.answer}
            sources={result.sources}
            verification={result.verification}
          />
        )}
      </div>
    </div>
  );
}
