import { useState } from 'react';
import { detachDocument } from '../api/client';
import { IconClose } from './icons';

type Props = {
  conversationId: number | null;
  attachedDocIds: string[];
  documents: { id: string; title: string }[];
  onDetach: (documentId: string) => void;
  onToggle: (documentId: string) => void;
};

export default function AttachedDocsChips({
  conversationId,
  attachedDocIds,
  documents,
  onDetach,
  onToggle
}: Props) {
  if (!conversationId || attachedDocIds.length === 0) return null;

  const docMap = new Map(documents.map(d => [d.id, d.title]));

  return (
    <div className="attached-chips">
      <span className="attached-label">Attached: </span>
      {attachedDocIds.map(docId => {
        const title = docMap.get(docId) || docId;
        const isAttached = attachedDocIds.includes(docId);
        return (
          <span key={docId} className="attached-chip">
            {title}
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label={`Detach ${title}`}
              onClick={() => onDetach(docId)}
            >
              <IconClose size={12} />
            </button>
          </span>
        );
      })}
      <span className="attached-count">({attachedDocIds.length})</span>
    </div>
  );
}
