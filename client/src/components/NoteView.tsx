import type { Note } from "../types";
import NoteMarkdown from "./NoteMarkdown";

type NoteViewProps = {
  selectedNote: Note | null;
  relatedNotes: Note[];
  isLoadingNote: boolean;
  isLoadingRelated: boolean;
  onViewNote: (id: string) => void;
  onCreateNote: () => void;
  hasNotes: boolean;
  onEditNote: (note: Note) => void;
  onDeleteNote: (note: Note) => void;
  deletingNoteId: string | null;
};

// Helper to format date as "Aug 23, 2026"
function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function NoteView({
  selectedNote,
  relatedNotes,
  isLoadingNote,
  isLoadingRelated,
  onViewNote,
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
        <div className="skeleton-block skeleton-card" />
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
            ? "Open a note from the list, or search for a symptom or an exact error."
            : "Capture an error, what caused it, and the solution you want to find again."}
        </p>
        <button type="button" className="primary-btn" onClick={onCreateNote}>
          New note
        </button>
      </div>
    );
  }

  const legacyCollectionName = selectedNote.collection
    ? typeof selectedNote.collection === "object"
      ? selectedNote.collection.name
      : selectedNote.collection
    : null;

  return (
    <section className="note-view" aria-labelledby="note-view-title">
      {/* Header with title + metadata */}
      <div className="note-header">
        <div>
          <h1 className="note-title" id="note-view-title">
            {selectedNote.title}
          </h1>
          <div className="note-meta-line">
            <time className="note-date" dateTime={selectedNote.createdAt}>
              {formatDate(selectedNote.createdAt)}
            </time>
            {selectedNote.collections?.map((collection) => (
              <span className="note-chip collection-chip" key={collection._id}>
                {collection.name}
              </span>
            ))}
            {!selectedNote.collections?.length && legacyCollectionName && (
              <span className="note-chip collection-chip">
                {legacyCollectionName}
              </span>
            )}
            {selectedNote.tags?.map((tag) => (
              <span key={tag._id} className="note-chip">
                {tag.name}
              </span>
            ))}
          </div>
        </div>
        <div className="note-header-actions">
          <button
            type="button"
            className="secondary-btn"
            onClick={() => onEditNote(selectedNote)}
          >
            Edit
          </button>
          <button
            type="button"
            className="danger-btn"
            onClick={() => onDeleteNote(selectedNote)}
            disabled={deletingNoteId === selectedNote._id}
          >
            {deletingNoteId === selectedNote._id ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      {/* Note content */}
      <article className="note-content">
        <NoteMarkdown content={selectedNote.content} />
      </article>

      {/* Embedding status – text-only, no background */}
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

      {/* Related notes */}
      {(isLoadingRelated || relatedNotes.length > 0) && (
        <section className="related-section">
          <div className="section-heading">
            <div>
              <h2>Related notes</h2>
              <p>Based on semantic similarity</p>
            </div>
          </div>
          <div className="related-list">
            {isLoadingRelated ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div className="related-skeleton" key={i}>
                  <div className="skeleton-block related-skel-title" />
                  <div className="skeleton-block related-skel-score" />
                </div>
              ))
            ) : relatedNotes.length === 0 ? (
              <div className="related-empty">
                No closely related notes found.
              </div>
            ) : (
              relatedNotes.map((item) => {
                const score = Math.round((item.similarityScore || 0) * 100);
                return (
                  <button
                    type="button"
                    key={item._id}
                    className="related-item"
                    onClick={() => onViewNote(item._id)}
                  >
                    <div className="related-main">
                      <span className="related-title">{item.title}</span>
                      {item.tags && item.tags.length > 0 && (
                        <span className="note-chip">{item.tags[0].name}</span>
                      )}
                      {item.collection && (
                        <span className="note-chip collection-chip">
                          {typeof item.collection === "object"
                            ? item.collection.name
                            : item.collection}
                        </span>
                      )}
                    </div>
                    <div className="related-score">
                      <span className="score-track">
                        <span
                          className="score-fill"
                          style={{ width: `${score}%` }}
                        />
                      </span>
                      <strong>{score}%</strong>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>
      )}
    </section>
  );
}
