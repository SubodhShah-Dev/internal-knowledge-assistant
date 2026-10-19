import SourceList from './SourceList';
import type { Source } from '../types';

type Props = {
  answer: string;
  sources: Source[];
};

export default function AnswerCard({ answer, sources }: Props) {
  if (!answer) return null;
  return (
    <>
      <div className="answer-box" data-testid="answer">
        <h3>Answer</h3>
        <p>{answer}</p>
      </div>
      <SourceList sources={sources} />
    </>
  );
}
