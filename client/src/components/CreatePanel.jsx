import React, { useEffect, useRef, useState } from 'react';

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
  collections = [],
  selectedCollectionId = '',
  setSelectedCollectionId,
  newCollectionName,
  setNewCollectionName,
  onCreateCollection,
}) {
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const collectionInputRef = useRef(null);

  const getCollectionId = (collection) =>
    String(collection?._id ?? collection?.id ?? '');
  const getCollectionName = (collection) =>
    collection?.name ?? 'Untitled collection';

  const handleCollectionChange = (event) => {
    const value = event.target.value;
    if (value === '__create_collection__') {
      setIsCreatingCollection(true);
      window.requestAnimationFrame(() => {
        collectionInputRef.current?.focus();
      });
    } else {
      setSelectedCollectionId(value);
    }
  };

  const handleCreateCollection = async (event) => {
    event.preventDefault();
    const name = newCollectionName.trim();
    if (!name) {
      collectionInputRef.current?.focus();
      return;
    }
    try {
      const created = await onCreateCollection(name);
      if (created) {
        const createdId = getCollectionId(created);
        if (createdId) setSelectedCollectionId(createdId);
        setNewCollectionName('');
        setIsCreatingCollection(false);
      }
    } catch {
      collectionInputRef.current?.focus();
    }
  };

  const closeCollectionCreator = () => {
    setIsCreatingCollection(false);
    setNewCollectionName('');
    setSelectedCollectionId('');
  };

  useEffect(() => {
    setIsCreatingCollection(false);
    setNewCollectionName('');
  }, [isEditing]);

  const selectedCollectionExists = collections.some(
    (c) => getCollectionId(c) === String(selectedCollectionId)
  );

  return (
    <aside className="create-panel">
      <div className="create-header">
        <div>
          <div className="eyebrow">{isEditing ? 'Edit note' : 'Quick capture'}</div>
          <h2>{isEditing ? 'Edit note' : 'New note'}</h2>
        </div>
        {isEditing && (
          <button type="button" className="text-btn" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
        )}
      </div>

      <form onSubmit={onSubmit} className="create-form">
        {/* Title */}
        <label className="form-field form-field-title">
          <span>Title</span>
          <input
            id="note-title"
            type="text"
            placeholder="Understanding idempotency…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            autoComplete="off"
            required
          />
        </label>

        {/* Tags */}
        <label className="form-field">
          <span>Tags</span>
          <input
            type="text"
            placeholder="react, hooks, optimization"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            maxLength={500}
            autoComplete="off"
          />
          <small className="form-help">Separate tags with commas.</small>
        </label>

        {/* Collection */}
        <div className="form-field">
          <span>Collection</span>
          <select
            value={
              isCreatingCollection
                ? '__create_collection__'
                : selectedCollectionExists
                ? selectedCollectionId
                : ''
            }
            onChange={handleCollectionChange}
            disabled={isCreatingCollection}
          >
            <option value="">Uncategorized</option>
            {collections.map((collection) => {
              const id = getCollectionId(collection);
              return (
                <option key={id} value={id}>
                  {getCollectionName(collection)}
                </option>
              );
            })}
            <option value="__create_collection__">＋ New collection…</option>
          </select>

          {isCreatingCollection && (
            <div className="collection-quick-create">
              <input
                ref={collectionInputRef}
                type="text"
                value={newCollectionName}
                placeholder="Collection name"
                maxLength={100}
                autoComplete="off"
                onChange={(e) => setNewCollectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    closeCollectionCreator();
                  }
                }}
              />
              <div className="collection-create-actions">
                <button
                  type="button"
                  className="primary-btn collection-create-btn"
                  onClick={handleCreateCollection}
                  disabled={!newCollectionName.trim()}
                >
                  Create
                </button>
                <button
                  type="button"
                  className="secondary-btn collection-cancel-btn"
                  onClick={closeCollectionCreator}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <label className="form-field form-field-content">
          <span>Content</span>
          <textarea
            placeholder="Write the idea, fix, snippet, or reference you want to remember…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
          />
        </label>

        {/* Footer */}
        <div className="create-footer">
          <span className="create-hint">
            <kbd>⌘ Enter</kbd> to save · <kbd>Esc</kbd> to cancel
          </span>
          <button
            type="submit"
            className="primary-btn save-btn"
            disabled={isSaving || isCreatingCollection}
          >
            {isSaving ? 'Saving…' : submitLabel}
          </button>
        </div>
      </form>
    </aside>
  );
}
