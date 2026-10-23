import { useEffect, useRef } from 'react';
import UploadForm from './UploadForm';
import DocumentList from './DocumentList';
import { IconClose } from './icons';

type Props = {
  open: boolean;
  refreshToken: number;
  onClose: () => void;
  onUploaded: () => void;
  onUnauthorized: () => void;
};

export default function DocumentsModal({
  open,
  refreshToken,
  onClose,
  onUploaded,
  onUnauthorized
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  return (
    <dialog className="modal" ref={dialogRef} aria-label="Documents">
      <div className="modal-card">
        <div className="modal-head">
          <h2>Documents</h2>
          <button className="btn btn-ghost btn-icon" aria-label="Close documents" onClick={onClose}>
            <IconClose size={17} />
          </button>
        </div>
        <div className="modal-body">
          <UploadForm onUploaded={onUploaded} onUnauthorized={onUnauthorized} />
          <DocumentList refreshToken={refreshToken} onUnauthorized={onUnauthorized} />
        </div>
      </div>
    </dialog>
  );
}
