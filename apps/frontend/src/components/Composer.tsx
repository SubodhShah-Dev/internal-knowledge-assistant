import { useEffect, useRef } from 'react';
import { IconPaperclip, IconSend, IconStop } from './icons';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onOpenDocuments: () => void;
  busy: boolean;
  disabled?: boolean;
};

export default function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  onOpenDocuments,
  busy,
  disabled
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !busy && !disabled;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (canSend) onSubmit();
    }
  }

  return (
    <div className="composer-wrap">
      <div className="composer">
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label="Upload a document"
          title="Upload a document"
          onClick={onOpenDocuments}
          disabled={disabled}
        >
          <IconPaperclip size={18} />
        </button>
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          placeholder="Ask a question about your documents…"
          aria-label="Ask a question about your documents"
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        {busy ? (
          <button type="button" className="btn stop-btn" aria-label="Stop generating" onClick={onStop}>
            <IconStop size={16} />
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary send-btn"
            aria-label="Send message"
            onClick={onSubmit}
            disabled={!canSend}
          >
            <IconSend size={16} />
          </button>
        )}
      </div>
      <p className="composer-hint">Enter to send · Shift+Enter for a new line</p>
    </div>
  );
}
