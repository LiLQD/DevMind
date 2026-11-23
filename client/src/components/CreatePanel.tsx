import { useRef, useState } from "react";
import type { ChangeEvent, FormEventHandler, MouseEvent } from "react";
import type { Collection } from "../types";
import NoteMarkdown from "./NoteMarkdown";

import { fitsNoteRequest, readMarkdownFile } from "../markdownFile";

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
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const collectionInputRef = useRef<HTMLInputElement>(null);
  const contentInputRef = useRef<HTMLTextAreaElement>(null);

  const importMarkdown = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file || isImporting) return;

    setImportError("");
    setIsImporting(true);
    try {
      const { title: importedTitle, content: markdown } =
        await readMarkdownFile(file);
      if (!input.isConnected) return;
      const body = JSON.stringify({
        title: importedTitle,
        content: markdown.trim(),
        tags: [],
      });
      if (!fitsNoteRequest(body)) {
        setImportError("This file exceeds the 1 MiB note request limit.");
        return;
      }

      setIsPreviewing(false);
      setTitle(importedTitle);
      setContent(markdown);
      window.requestAnimationFrame(() => titleInputRef.current?.focus());
    } catch (error) {
      if (input.isConnected) {
        setImportError(
          error instanceof Error
            ? error.message
            : "Could not read this file as UTF-8 Markdown.",
        );
      }
    } finally {
      if (input.isConnected) setIsImporting(false);
    }
  };

  const applyFixTemplate = () => {
    setIsPreviewing(false);
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
    <section className="create-panel" aria-labelledby="editor-title">
      <div className="create-header">
        <h1 id="editor-title">{isEditing ? "Edit note" : "New note"}</h1>
      </div>

      <form
        onSubmit={(event) => {
          if (isImporting) {
            event.preventDefault();
            return;
          }
          setIsPreviewing(false);
          onSubmit(event);
        }}
        className="create-form"
      >
        {!isEditing && !title && !content && (
          <div className="markdown-import">
            <input
              ref={fileInputRef}
              type="file"
              accept=".md"
              hidden
              onChange={(event) => void importMarkdown(event)}
            />
            <button
              type="button"
              className="secondary-btn"
              disabled={isImporting || isSaving}
              onClick={() => fileInputRef.current?.click()}
            >
              {isImporting ? "Reading file…" : "Import Markdown"}
            </button>
            {importError && <p role="alert">{importError}</p>}
          </div>
        )}

        {/* Title */}
        <label className="form-field form-field-title">
          <span>Title</span>
          <input
            id="note-title"
            ref={titleInputRef}
            readOnly={isImporting}
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
          <label className="form-label" htmlFor="note-collection">
            Collection
          </label>
          <select
            id="note-collection"
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
            disabled={isSaving || isImporting}
          >
            Use Save a fix template
          </button>
        )}

        {/* Content */}
        <div className="form-field form-field-content">
          <div className="markdown-editor-header">
            <label htmlFor="note-content">Content (Markdown)</label>
            <div
              className="markdown-editor-actions"
              role="group"
              aria-label="Markdown editor mode"
            >
              <button
                type="button"
                className="secondary-btn"
                aria-pressed={!isPreviewing}
                onClick={() => setIsPreviewing(false)}
              >
                Write
              </button>
              <button
                type="button"
                className="secondary-btn"
                aria-pressed={isPreviewing}
                onClick={() => setIsPreviewing(true)}
              >
                Preview
              </button>
            </div>
          </div>
          <textarea
            id="note-content"
            readOnly={isImporting}
            ref={contentInputRef}
            placeholder="Write the idea, fix, snippet, or reference you want to remember…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            hidden={isPreviewing}
            required={!isPreviewing}
          />
          {isPreviewing && (
            <article
              className="note-content markdown-editor-preview"
              aria-label="Markdown preview"
            >
              {content.trim() ? (
                <NoteMarkdown content={content} />
              ) : (
                <p>Nothing to preview yet.</p>
              )}
            </article>
          )}
        </div>

        {/* Footer */}
        <div className="create-footer">
          <span className="create-hint">
            <kbd>⌘ Enter</kbd> to save · <kbd>Esc</kbd> to cancel
          </span>
          <div className="create-footer-actions">
            <button
              type="button"
              className="secondary-btn"
              onClick={onCancel}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-btn save-btn"
              disabled={isSaving || isCreatingCollection || isImporting}
            >
              {isSaving ? "Saving…" : submitLabel}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
