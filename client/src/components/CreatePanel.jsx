export default function CreatePanel({
  isEditing,
  title,
  setTitle,
  content,
  setContent,
  tagInput,
  setTagInput,
  onSubmit,
  onCancel,
  isSaving,
  submitLabel,
}) {
  return (
    <aside className="create-panel">
      <div className="create-header">
        <div>
          <div className="eyebrow">{isEditing ? 'Edit note' : 'Quick capture'}</div>
          <h2>{isEditing ? 'Edit note' : 'New note'}</h2>
        </div>
        {isEditing && <button type="button" className="text-btn" onClick={onCancel}>Cancel</button>}
      </div>

      <form onSubmit={onSubmit} className="create-form">
        <label className="form-field">
          <span>Title</span>
          <input id="note-title" type="text" placeholder="Understanding idempotency…" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required />
        </label>

        <label className="form-field">
          <span>Tags (comma separated)</span>
          <input type="text" placeholder="react, hooks, optimization" value={tagInput} onChange={e => setTagInput(e.target.value)} />
        </label>

        <label className="form-field form-field-grow">
          <span>Content</span>
          <textarea placeholder="Write the idea, fix, snippet, or reference you want to remember…" value={content} onChange={e => setContent(e.target.value)} required />
        </label>

        <div className="create-footer">
          <span className="create-hint"><kbd>⌘ Enter</kbd> to save · <kbd>Esc</kbd> to cancel</span>
          <button type="submit" className="primary-btn save-btn" disabled={isSaving}>
            {isSaving ? 'Saving…' : submitLabel}
          </button>
        </div>
      </form>
    </aside>
  );
}
