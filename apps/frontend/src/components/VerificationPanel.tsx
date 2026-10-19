import type { Verification } from '../types';

type Props = {
  verification: Verification | null;
};

const STATUS_LABELS: Record<string, string> = {
  verified: 'Verified',
  partial: 'Partially supported',
  unsupported: 'Not supported',
  unverified: 'Unverified',
  supported: 'Supported',
  partial_claim: 'Partial',
  uncited: 'No citation'
};

function claimStatusLabel(status: string): string {
  if (status === 'partial') return 'Partially supported';
  return STATUS_LABELS[status] ?? status;
}

export default function VerificationPanel({ verification }: Props) {
  if (!verification) return null;

  return (
    <div className="verification-box" data-testid="verification">
      <div className="box-header">
        <h3>Groundedness Audit</h3>
        <span className={`badge badge-${verification.status}`}>
          {STATUS_LABELS[verification.status] ?? verification.status} · {verification.score}%
        </span>
      </div>
      <p className="muted">
        Each claim below was checked against the cited excerpts by a second LLM pass.
        Answers are only as trustworthy as this audit.
      </p>

      <div className="meter" role="meter" aria-valuenow={verification.score} aria-valuemin={0} aria-valuemax={100}>
        <div className={`meter-fill meter-${verification.status}`} style={{ width: `${verification.score}%` }} />
      </div>

      <ul className="claim-list">
        {verification.claims.map((claim, index) => (
          <li key={index} className="claim-item">
            <span className={`badge badge-${claim.status}`}>{claimStatusLabel(claim.status)}</span>
            <span className="claim-text">{claim.text}</span>
            {claim.sourceLabels.length > 0 && (
              <span className="muted claim-cites">cites {claim.sourceLabels.join(', ')}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
