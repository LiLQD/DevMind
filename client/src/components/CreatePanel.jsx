import React, { useEffect, useRef, useState } from 'react';

function CreatePanel({
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

  // Normalize collection IDs so the component works with either
  // MongoDB-style _id or a plain id.
  const getCollectionId = (collection) =>
    String(collection?._id ?? collection?.id ?? '');

  const getCollectionName = (collection) =>
    collection?.name ?? 'Untitled collection';

  const handleCollectionChange = (event) => {
    setSelectedCollectionId(event.target.value);
  };

  const openCollectionCreator = () => {
    setIsCreatingCollection(true);

    window.requestAnimationFrame(() => {
      collectionInputRef.current?.focus();
    });
  };

  const closeCollectionCreator = () => {
    setIsCreatingCollection(false);
    setNewCollectionName('');
  };

  const handleCreateCollection = async (event) => {
    event.preventDefault();

    const name = newCollectionName.trim();

    if (!name) {
      collectionInputRef.current?.focus();
      return;
    }

    setIsCreatingCollection(true);

    try {
      const created = await onCreateCollection(name);

      // App.jsx returns the newly created collection.
      // Automatically select it after creation.
      if (created) {
        const createdId = getCollectionId(created);

        if (createdId) {
          setSelectedCollectionId(createdId);
        }

        setNewCollectionName('');
        setIsCreatingCollection(false);
      }
    } catch {
      // onCreateCollection already handles the notification/error.
      // Keep the creation UI open so the user can retry.
      collectionInputRef.current?.focus();
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeCollectionCreator();
    }
  };

  // When switching from edit mode back to create mode,
  // make sure the inline collection creator is closed.
  useEffect(() => {
    setIsCreatingCollection(false);
    setNewCollectionName('');
  }, [isEditing]);

  const selectedCollectionExists = collections.some(
    (collection) =>
      getCollectionId(collection) === String(selectedCollectionId)
  );

  return (
    <aside className="create-panel">
      <div className="create-header">
        <div>
          <div className="eyebrow">
            {isEditing ? 'Edit note' : 'Quick capture'}
          </div>

          <h2>{isEditing ? 'Edit note' : 'New note'}</h2>
        </div>

        {isEditing && (
          <button
            type="button"
            className="text-btn"
            onClick={onCancel}
            disabled={isSaving}
          >
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
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            autoComplete="off"
            required
          />
        </label>

        {/* Organization */}
        <div className="form-section">
          <div className="form-section-title">Organization</div>

          {/* Tags */}
          <label className="form-field">
            <span>Tags</span>

            <input
              type="text"
              placeholder="react, hooks, optimization"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              maxLength={500}
              autoComplete="off"
            />

            <small className="form-help">
              Separate tags with commas.
            </small>
          </label>

          {/* Collection */}
          <div className="form-field">
            <span>Collection</span>

            <select
              value={
                selectedCollectionExists
                  ? selectedCollectionId
                  : ''
              }
              onChange={handleCollectionChange}
              disabled={isCreatingCollection}
            >
              <option value="">
                Uncategorized
              </option>

              {collections.map((collection) => {
                const id = getCollectionId(collection);

                return (
                  <option key={id} value={id}>
                    {getCollectionName(collection)}
                  </option>
                );
              })}

              <option value="__create_collection__">
                ＋ New collection…
              </option>
            </select>

            {/* Inline collection creation */}
            {selectedCollectionId === '__create_collection__' ? (
              <div className="collection-quick-create">
                <input
                  ref={collectionInputRef}
                  type="text"
                  value={newCollectionName}
                  placeholder="Collection name"
                  maxLength={100}
                  autoComplete="off"
                  onChange={(event) => {
                    setNewCollectionName(event.target.value);
                  }}
                  onKeyDown={handleKeyDown}
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
                    onClick={() => {
                      setSelectedCollectionId('');
                      closeCollectionCreator();
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="collection-new-btn"
                onClick={() => {
                  setSelectedCollectionId('__create_collection__');
                  openCollectionCreator();
                }}
              >
                + New collection
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <label className="form-field form-field-content">
          <span>Content</span>

          <textarea
            id="note-content"
            placeholder="Write the idea, fix, snippet, or reference you want to remember…"
            value={content}
            onChange={(event) => setContent(event.target.value)}
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

export default CreatePanel;
