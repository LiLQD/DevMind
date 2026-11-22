import type { ReactNode, Ref } from "react";
import type { Collection } from "../types";
import type { SearchMode } from "../types";
import type { NoteListProps } from "./NoteList";

type SidebarProps = Omit<NoteListProps, "emptyMessage" | "emptyHint"> & {
  isSearching: boolean;
  searchMode: SearchMode;
  search: ReactNode;
  newNoteButtonRef: Ref<HTMLButtonElement>;
  onNewNote: () => void;
  onResumeDraft?: () => void;
  selectedCollectionFilter: string | null;
  setSelectedCollectionFilter: (id: string | null) => void;
  collections?: Collection[];
};

import NoteList from "./NoteList";

export default function Sidebar({
  notes,
  exactSearchQuery,
  selectedNoteId,
  isLoading,
  isSearching,
  searchMode,
  search,
  newNoteButtonRef,
  noteListRef,
  onNewNote,
  onResumeDraft,
  onViewNote,
  onEditNote,
  onDeleteNote,
  selectedCollectionFilter,
  setSelectedCollectionFilter,
  collections = [],
}: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Browse notes">
      <div className="browse-header">
        <div className="browse-heading">
          <h1>Notes</h1>
          <button
            ref={newNoteButtonRef}
            type="button"
            className="primary-btn"
            onClick={onNewNote}
          >
            New note
          </button>
        </div>
        {onResumeDraft && (
          <button
            type="button"
            className="secondary-btn resume-draft"
            onClick={onResumeDraft}
          >
            Resume draft
          </button>
        )}
        {search}
      </div>
      <div className="notes-toolbar">
        <span aria-live="polite">
          {isSearching
            ? `${notes.length} ${notes.length === 1 ? "match" : "matches"}`
            : "Your notes"}
        </span>

        <div className="sidebar-filters">
          {!isSearching && collections.length > 0 && (
            <select
              aria-label="Filter notes by collection"
              value={selectedCollectionFilter || ""}
              onChange={(e) =>
                setSelectedCollectionFilter(e.target.value || null)
              }
              className="collection-filter"
            >
              <option value="">All collections</option>

              {collections.map((collection) => (
                <option key={collection._id} value={collection._id}>
                  {collection.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <NoteList
        notes={notes}
        noteListRef={noteListRef}
        exactSearchQuery={exactSearchQuery}
        selectedNoteId={selectedNoteId}
        isLoading={isLoading}
        onViewNote={onViewNote}
        onEditNote={onEditNote}
        onDeleteNote={onDeleteNote}
        emptyMessage={
          isSearching ? "No notes matched your search." : "No notes yet."
        }
        emptyHint={
          isSearching
            ? searchMode === "exact"
              ? "Try a shorter phrase, or switch to By meaning."
              : "Try describing the problem in different words."
            : "Create your first note to start building your knowledge base."
        }
      />
    </aside>
  );
}
