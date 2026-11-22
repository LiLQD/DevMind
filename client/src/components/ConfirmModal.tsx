import { useEffect, useId, useRef } from "react";

type ConfirmModalProps = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isBusy?: boolean;
};

export default function ConfirmModal({
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  isBusy = false,
}: ConfirmModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="confirm-modal"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (!isBusy) onCancel();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      <div className="modal-actions">
        <button
          ref={cancelRef}
          type="button"
          className="secondary-btn"
          onClick={onCancel}
          disabled={isBusy}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className="danger-solid-btn"
          onClick={onConfirm}
          disabled={isBusy}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
