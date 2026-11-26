import type { Note } from "../types";
import Disclosure from "../features/workspace/Disclosure";
import {
  collectionName,
  readingDate,
  wordCount,
} from "../features/workspace/NoteDetails";
import { FocusControl } from "../features/workspace/WorkspaceShell";
import WorkspaceIcon from "../features/workspace/WorkspaceIcon";
import NoteMarkdown from "./NoteMarkdown";

type NoteViewProps = {
  selectedNote: Note | null;
  isLoadingNote: boolean;
  onCreateNote: () => void;
  hasNotes: boolean;
  onEditNote: (note: Note) => void;
  onDeleteNote: (note: Note) => void;
  deletingNoteId: string | null;
};

export default function NoteView({
  selectedNote,
  isLoadingNote,
  onCreateNote,
  hasNotes,
  onEditNote,
  onDeleteNote,
  deletingNoteId,
}: NoteViewProps) {
  if (isLoadingNote) {
    return (
      <div className="note-loading" role="status" aria-label="Loading note">
        <div className="skeleton-block skeleton-heading" />
        <div className="skeleton-block skeleton-paragraph" />
        <div className="skeleton-block skeleton-paragraph short" />
      </div>
    );
  }

  if (!selectedNote) {
    return (
      <div className="main-empty">
        <h1 className="main-empty-title">
          {hasNotes ? "Choose a note" : "Save your first fix"}
        </h1>
        <p>
          {hasNotes
            ? "Open a note from the list, or search for a symptom or exact error."
            : "Capture an error, what caused it, and the solution you want to find again."}
        </p>
        <button type="button" className="primary-btn" onClick={onCreateNote}>
          New note
        </button>
      </div>
    );
  }

  const date = selectedNote.updatedAt ?? selectedNote.createdAt;
  return (
    <section
      className="note-view editorial-note"
      aria-labelledby="note-view-title"
    >
      <header className="editorial-header">
        <div className="note-header-actions">
          <button
            type="button"
            className="secondary-btn"
            onClick={() => onEditNote(selectedNote)}
          >
            <WorkspaceIcon name="edit" /> Edit
          </button>
          <button
            type="button"
            className="primary-btn share-placeholder"
            disabled
            title="Coming soon"
            aria-label="Share, coming soon"
          >
            Share
          </button>
          <FocusControl />
          <Disclosure
            key={selectedNote._id}
            className="note-more"
            label="More note actions"
            trigger={<span aria-hidden="true">•••</span>}
          >
            <button
              type="button"
              className="danger-btn"
              onClick={() => onDeleteNote(selectedNote)}
              disabled={deletingNoteId === selectedNote._id}
            >
              Delete note
            </button>
          </Disclosure>
        </div>
        <h1 className="note-title" id="note-view-title">
          {selectedNote.title}
        </h1>
        <div className="note-meta-line">
          <time dateTime={date}>{readingDate(date)}</time>
          <span aria-hidden="true">·</span>
          <span>{wordCount(selectedNote.content)} words</span>
          <span className="editorial-collection">
            ◇ {collectionName(selectedNote)}
          </span>
        </div>
        {!!selectedNote.tags?.length && (
          <div className="editorial-tags">
            {selectedNote.tags.map((tag) => (
              <span key={tag._id} className="note-chip">
                # {tag.name}
              </span>
            ))}
          </div>
        )}
      </header>
      <article className="note-content">
        <NoteMarkdown content={selectedNote.content} />
      </article>
      <div className="embedding-status">
        <span className="state-dot" />
        <span>
          {selectedNote.embeddingStatus === "success"
            ? "Ready for semantic search"
            : selectedNote.embeddingStatus === "failed"
              ? "Saved without embedding"
              : "Embedding in progress"}
        </span>
      </div>
    </section>
  );
}
