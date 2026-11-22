import type { Note } from "../types";

type NoteItemProps = {
  note: Note;
  exactSearchQuery: string;
  isActive: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

// Helper to format date as "Aug 23"
function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function highlightMatch(
  text: string,
  match: RegExpExecArray,
  start = 0,
  end = text.length,
) {
  const matchEnd = match.index + match[0].length;
  return (
    <>
      {text.slice(start, match.index)}
      <mark>{match[0]}</mark>
      {text.slice(matchEnd, end)}
    </>
  );
}

export default function NoteItem({
  note,
  exactSearchQuery,
  isActive,
  onView,
  onEdit,
  onDelete,
}: NoteItemProps) {
  const pattern = exactSearchQuery
    ? new RegExp(exactSearchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    : null;
  const titleMatch = pattern?.exec(note.title);
  const bodyMatch = pattern?.exec(note.content);
  const collections = exactSearchQuery ? note.collections : undefined;

  let excerpt;
  if (bodyMatch) {
    const matchEnd = bodyMatch.index + bodyMatch[0].length;
    const lineStart = note.content.lastIndexOf("\n", bodyMatch.index - 1) + 1;
    const nextLine = note.content.indexOf("\n", matchEnd);
    const lineEnd = nextLine === -1 ? note.content.length : nextLine;
    const start = Math.max(lineStart, bodyMatch.index - 40);
    const end = Math.min(lineEnd, matchEnd + 60);

    excerpt = (
      <p className="note-match-excerpt">
        {start > lineStart ? "…" : ""}
        {highlightMatch(note.content, bodyMatch, start, end)}
        {end < lineEnd ? "…" : ""}
      </p>
    );
  }

  return (
    <div
      className={`note-item ${isActive ? "active" : ""}`}
      onClick={onView}
      role="button"
      tabIndex={0}
    >
      <div className="note-item-top">
        <h3 className={titleMatch ? "note-match-title" : undefined}>
          {titleMatch ? highlightMatch(note.title, titleMatch) : note.title}
        </h3>
        <div className="note-item-actions">
          <span
            className={`status-dot ${note.embeddingStatus === "failed" ? "failed" : ""}`}
            title={
              note.embeddingStatus === "failed"
                ? "Saved without embedding"
                : "Ready for semantic search"
            }
          />
          <button
            type="button"
            className="row-action edit-action"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className="row-action delete-action"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {excerpt}

      <div
        className={
          exactSearchQuery
            ? "note-item-bottom note-match-meta"
            : "note-item-bottom"
        }
      >
        <span className="note-date">{formatDate(note.createdAt)}</span>
        {collections?.map((collection) => (
          <span key={collection._id} className="note-chip collection-chip">
            {collection.name}
          </span>
        ))}
        {!collections?.length && note.collection && (
          <span className="note-chip collection-chip">
            {typeof note.collection === "object"
              ? note.collection.name
              : note.collection}
          </span>
        )}
        {note.similarityScore != null && (
          <span className="score-chip">
            {Math.round(note.similarityScore * 100)}%
          </span>
        )}
      </div>
    </div>
  );
}
