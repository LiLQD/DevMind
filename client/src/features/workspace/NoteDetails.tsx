import type { Note } from "../../types";
import { PanelControl } from "./WorkspaceShell";

export const readingDate = (timestamp: string) =>
  new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export function collectionName(note: Note) {
  return (
    note.collections?.map(({ name }) => name).join(", ") ||
    (typeof note.collection === "object"
      ? note.collection?.name
      : note.collection) ||
    "Uncategorized"
  );
}

const words = new Intl.Segmenter(undefined, { granularity: "word" });
export function wordCount(content: string) {
  let count = 0;
  for (const word of words.segment(content)) if (word.isWordLike) count++;
  return count.toLocaleString();
}

export default function NoteDetails({
  note,
  related,
  loading,
  onView,
}: {
  note: Note;
  related: Note[];
  loading: boolean;
  onView: (id: string) => void;
}) {
  return (
    <aside className="note-details-panel" aria-label="Note details">
      <div className="details-heading">
        <h2>Note details</h2>
        <PanelControl panel="details" />
      </div>
      <dl>
        <div>
          <dt>Collection</dt>
          <dd>{collectionName(note)}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>
            <time dateTime={note.createdAt}>{readingDate(note.createdAt)}</time>
          </dd>
        </div>
        <div>
          <dt>Last edited</dt>
          <dd>
            <time dateTime={note.updatedAt ?? note.createdAt}>
              {readingDate(note.updatedAt ?? note.createdAt)}
            </time>
          </dd>
        </div>
        <div>
          <dt>Word count</dt>
          <dd>{wordCount(note.content)}</dd>
        </div>
      </dl>
      <section className="workspace-related">
        <h2>Related notes</h2>
        {loading ? (
          <div
            role="status"
            aria-label="Loading related notes"
            className="skeleton-block skeleton-title-sm"
          />
        ) : related.length ? (
          <ul>
            {related.map((item) => (
              <li key={item._id}>
                <button type="button" onClick={() => onView(item._id)}>
                  <span aria-hidden="true">▤</span> {item.title}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No closely related notes found.</p>
        )}
      </section>
    </aside>
  );
}
