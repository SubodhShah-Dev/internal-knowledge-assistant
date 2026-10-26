import type { ThreadMessage } from '../types';
import SourceList from './SourceList';
import VerificationPanel from './VerificationPanel';
import RichText from './RichText';
import { IconChevron, IconSpark } from './icons';

type Props = {
  message: ThreadMessage;
};

export default function ChatMessage({ message }: Props) {
  if (message.role === 'user') {
    return (
      <article className="message message-user">
        <div className="message-body">{message.text}</div>
      </article>
    );
  }

  const hasSources = (message.sources?.length ?? 0) > 0;
  const streaming = message.streaming;

  return (
    <article className="message message-assistant">
      <div className="message-avatar" aria-hidden="true">
        <IconSpark size={16} />
      </div>
      <div className="message-body">
        <div
          className={`answer-text${streaming ? ' cursor-blink' : ''}`}
          data-testid="answer"
        >
          <RichText text={message.text} />
        </div>

        {streaming && !message.error && (
          <div className="stream-note" aria-live="polite">
            {hasSources ? 'Answering from your documents…' : 'Retrieving evidence…'}
          </div>
        )}

        {message.error && (
          <div className="message-error" role="alert">
            {message.error}
          </div>
        )}

        {!streaming && hasSources && (
          <details className="msg-section">
            <summary>
              <IconChevron size={14} className="chevron" />
              Sources · {message.sources!.length}
            </summary>
            <div className="msg-section-body">
              <SourceList sources={message.sources!} />
            </div>
          </details>
        )}

        {!streaming && message.verification && (
          <details className="msg-section">
            <summary>
              <IconChevron size={14} className="chevron" />
              Groundedness Audit · {message.verification.score}%
            </summary>
            <div className="msg-section-body">
              <VerificationPanel verification={message.verification} />
            </div>
          </details>
        )}
      </div>
    </article>
  );
}
