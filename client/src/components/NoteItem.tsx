import { useId } from "react";
import type { Note } from "../types";

type NoteItemProps = {
  note: Note;
  exactSearchQuery: string;
  isActive: boolean;
  onView: () => void;
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
}: NoteItemProps) {
  const metadataId = useId();
  const pattern = exactSearchQuery
    ? new RegExp(exactSearchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    : null;
  const titleMatch = pattern?.exec(note.title);
  const bodyMatch = pattern?.exec(note.content);
  const date = note.updatedAt ?? note.createdAt;

  const preview = note.content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !/^(?:#{1,6}\s|```|~~~)/.test(line));

  let excerpt;
  if (bodyMatch) {
    const matchEnd = bodyMatch.index + bodyMatch[0].length;
    const lineStart = note.content.lastIndexOf("\n", bodyMatch.index - 1) + 1;
    const nextLine = note.content.indexOf("\n", matchEnd);
    const lineEnd = nextLine === -1 ? note.content.length : nextLine;
    const start = Math.max(lineStart, bodyMatch.index - 40);
    const end = Math.min(lineEnd, matchEnd + 60);

    excerpt = (
      <span className="note-match-excerpt">
        {start > lineStart ? "…" : ""}
        {highlightMatch(note.content, bodyMatch, start, end)}
        {end < lineEnd ? "…" : ""}
      </span>
    );
  }

  return (
    <div className={`note-item ${isActive ? "active" : ""}`}>
      <button
        className="note-open"
        type="button"
        aria-current={isActive ? "true" : undefined}
        aria-label={note.title}
        aria-describedby={metadataId}
        onClick={onView}
      >
        <span
          className={
            titleMatch ? "note-row-title note-match-title" : "note-row-title"
          }
        >
          {titleMatch ? highlightMatch(note.title, titleMatch) : note.title}
        </span>
        {excerpt ??
          (preview && (
            <span className="note-row-excerpt">{preview.slice(0, 160)}</span>
          ))}
        <span className="note-item-bottom" id={metadataId}>
          <time dateTime={date}>{formatDate(date)}</time>
          {note.embeddingStatus === "failed" && (
            <span>Saved without embedding</span>
          )}
          {note.similarityScore != null && (
            <span>{Math.round(note.similarityScore * 100)}%</span>
          )}
        </span>
      </button>
      <button
        type="button"
        className="favorite-star"
        disabled
        title="Coming soon"
        aria-label="Favorite, coming soon"
      >
        ☆
      </button>
    </div>
  );
}
