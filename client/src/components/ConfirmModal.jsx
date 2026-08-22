export default function ConfirmModal({ isOpen, title, onConfirm, onCancel, isDeleting }) {
  if (!isOpen) return null;
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
        <div>
          <div className="eyebrow">Delete note</div>
          <h2 id="delete-title">Delete “{title}”?</h2>
          <p>This action cannot be undone.</p>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-btn" onClick={onCancel} disabled={isDeleting}>Cancel</button>
          <button type="button" className="danger-solid-btn" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? 'Deleting…' : 'Delete note'}
          </button>
        </div>
      </div>
    </div>
  );
}
