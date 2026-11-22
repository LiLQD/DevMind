import { useRef, useState } from "react";
import type { ChangeEvent, FormEventHandler, MouseEvent } from "react";
import type { Collection } from "../types";

type CollectionOption = Partial<Collection> & { id?: string };

const fixTemplate = [
  "## Problem or symptom",
  "## Error message",
  "## Root cause",
  "## Solution",
  "## Code snippets",
  "## Source URL (optional)",
].join("\n\n\n");

type CreatePanelProps = {
  isEditing: boolean;
  title: string;
  setTitle: (title: string) => void;
  content: string;
  setContent: (content: string) => void;
  tagInput: string;
  setTagInput: (tags: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onCancel: () => void;
  isSaving: boolean;
  submitLabel: string;
  collections?: CollectionOption[];
  selectedCollectionId?: string;
  setSelectedCollectionId: (id: string) => void;
  newCollectionName: string;
  setNewCollectionName: (name: string) => void;
  onCreateCollection: (name: string) => Promise<CollectionOption | null>;
};

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
  selectedCollectionId = "",
  setSelectedCollectionId,
  newCollectionName,
  setNewCollectionName,
  onCreateCollection,
}: CreatePanelProps) {
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const collectionInputRef = useRef<HTMLInputElement>(null);
  const contentInputRef = useRef<HTMLTextAreaElement>(null);

  const applyFixTemplate = () => {
    setContent(fixTemplate);
    window.requestAnimationFrame(() => {
      const input = contentInputRef.current;
      const firstSection = fixTemplate.indexOf("\n") + 1;
      input?.focus();
      input?.setSelectionRange(firstSection, firstSection);
    });
  };

  const getCollectionId = (collection: CollectionOption) =>
    String(collection?._id ?? collection?.id ?? "");
  const getCollectionName = (collection: CollectionOption) =>
    collection?.name ?? "Untitled collection";

  const handleCollectionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value === "__create_collection__") {
      setIsCreatingCollection(true);
      window.requestAnimationFrame(() => {
        collectionInputRef.current?.focus();
      });
    } else {
      setSelectedCollectionId(value);
    }
  };

  const handleCreateCollection = async (
    event: MouseEvent<HTMLButtonElement>,
  ) => {
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
        setNewCollectionName("");
        setIsCreatingCollection(false);
      }
    } catch {
      collectionInputRef.current?.focus();
    }
  };

  const closeCollectionCreator = () => {
    setIsCreatingCollection(false);
    setNewCollectionName("");
    setSelectedCollectionId("");
  };

  const selectedCollectionExists = collections.some(
    (c) => getCollectionId(c) === String(selectedCollectionId),
  );

  return (
    <aside className="create-panel">
      <div className="create-header">
        <div>
          <div className="eyebrow">
            {isEditing ? "Edit note" : "Quick capture"}
          </div>
          <h2>{isEditing ? "Edit note" : "New note"}</h2>
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
                ? "__create_collection__"
                : selectedCollectionExists
                  ? selectedCollectionId
                  : ""
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
                  if (e.key === "Escape") {
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

        {!isEditing && !content.trim() && (
          <button
            type="button"
            className="text-btn"
            onClick={applyFixTemplate}
            disabled={isSaving}
          >
            Use Save a fix template
          </button>
        )}

        {/* Content */}
        <label className="form-field form-field-content">
          <span>Content</span>
          <textarea
            ref={contentInputRef}
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
            {isSaving ? "Saving…" : submitLabel}
          </button>
        </div>
      </form>
    </aside>
  );
}
