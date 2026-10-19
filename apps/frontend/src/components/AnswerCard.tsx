import SourceList from './SourceList';
import VerificationPanel from './VerificationPanel';
import type { Source, Verification } from '../types';

type Props = {
  answer: string;
  sources: Source[];
  verification: Verification | null;
};

export default function AnswerCard({ answer, sources, verification }: Props) {
  if (!answer) return null;
  return (
    <>
      <div className="answer-box" data-testid="answer">
        <h3>Answer</h3>
        <p>{answer}</p>
      </div>
      <VerificationPanel verification={verification} />
      <SourceList sources={sources} />
    </>
  );
}
