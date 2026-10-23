import type { Verification } from '../types';
import RichText from './RichText';

type Props = {
  verification: Verification | null;
};

const STATUS_LABELS: Record<string, string> = {
  verified: 'Verified',
  partial: 'Partially supported',
  unsupported: 'Not supported',
  unverified: 'Unverified',
  supported: 'Supported',
  uncited: 'No citation'
};

function claimStatusLabel(status: string): string {
  if (status === 'partial') return 'Partial';
  return STATUS_LABELS[status] ?? status;
}

function meterTone(status: Verification['status']): string {
  if (status === 'verified') return '';
  if (status === 'partial') return 'warn';
  return 'bad';
}

export default function VerificationPanel({ verification }: Props) {
  if (!verification) return null;

  return (
    <div data-testid="verification">
      <div className="verification-head">
        <span className="verification-score">Groundedness Audit</span>
        <span className={`badge badge-${verification.status}`}>
          {STATUS_LABELS[verification.status] ?? verification.status} · {verification.score}%
        </span>
      </div>
      <p className="verification-hint">
        Each claim was checked against the cited excerpts by a second LLM pass.
      </p>

      <div
        className="meter"
        role="meter"
        aria-label="Groundedness score"
        aria-valuenow={verification.score}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`meter-fill ${meterTone(verification.status)}`}
          style={{ width: `${verification.score}%` }}
        />
      </div>

      <ul className="claim-list">
        {verification.claims.map((claim, index) => (
          <li key={index} className="claim-item">
            <span className={`badge badge-${claim.status}`}>{claimStatusLabel(claim.status)}</span>
            <span className="claim-text">
              <RichText text={claim.text} />
              {claim.sourceLabels.length > 0 && (
                <span className="claim-cites">cites {claim.sourceLabels.join(', ')}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
