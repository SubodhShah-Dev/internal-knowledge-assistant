type Props = {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export default function QuestionForm({ value, busy, onChange, onSubmit }: Props) {
  return (
    <div className="question-box">
      <div className="row">
        <label htmlFor="question">Ask a question about your documents</label>
        <textarea
          id="question"
          rows={3}
          value={value}
          placeholder="e.g. What is the annual leave policy?"
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit();
          }}
        />
      </div>
      <div className="actions">
        <button onClick={onSubmit} disabled={busy || !value.trim()}>
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </div>
    </div>
  );
}
