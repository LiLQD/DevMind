import type { ReactNode, Ref } from "react";
import type { SearchMode } from "../types";
import type { NoteListProps } from "./NoteList";

type SidebarProps = Omit<NoteListProps, "emptyMessage" | "emptyHint"> & {
  isSearching: boolean;
  searchMode: SearchMode;
  search: ReactNode;
  newNoteButtonRef: Ref<HTMLButtonElement>;
  onNewNote: () => void;
  onResumeDraft?: () => void;
};

import NoteList from "./NoteList";
import { PanelControl } from "../features/workspace/WorkspaceShell";
import WorkspaceIcon from "../features/workspace/WorkspaceIcon";

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
}: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Browse notes">
      <div className="browse-header">
        <div className="browse-pane-heading">
          <h2>Notes</h2>
          <PanelControl panel="browse" />
        </div>
        {search}
        <div className="browse-heading">
          <button
            ref={newNoteButtonRef}
            type="button"
            className="primary-btn"
            onClick={onNewNote}
          >
            <WorkspaceIcon name="plus" /> New note
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
      </div>
      <div
        className="browse-favorites"
        aria-disabled="true"
        title="Coming soon"
      >
        <WorkspaceIcon name="star" /> Favorites <small>Coming soon</small>
      </div>
      <div className="notes-toolbar">
        <span aria-live="polite">
          {isSearching
            ? `${notes.length} ${notes.length === 1 ? "match" : "matches"}`
            : "Recent notes"}
        </span>
      </div>

      <NoteList
        notes={notes}
        noteListRef={noteListRef}
        exactSearchQuery={exactSearchQuery}
        selectedNoteId={selectedNoteId}
        isLoading={isLoading}
        onViewNote={onViewNote}
        emptyMessage={
          isSearching ? "No notes matched your search." : "No notes yet."
        }
        emptyHint={
          isSearching
            ? searchMode === "exact"
              ? "Try a shorter phrase, or switch to Semantic."
              : "Try describing the problem in different words."
            : "Create your first note to start building your knowledge base."
        }
      />
    </aside>
  );
}
