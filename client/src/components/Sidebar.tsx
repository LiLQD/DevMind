import { useState } from "react";
import NoteItem from "./NoteItem";
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
  favoritesView: boolean;
  recentFavorites?: NoteListProps["notes"];
  favoritesError: boolean;
  favoritesLoading: boolean;
  onRetryFavorites: () => void;
  onShowFavorites: () => void;
  onBrowseNotes: () => void;
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
  favorites,
  favoritesView,
  recentFavorites,
  favoritesError,
  favoritesLoading,
  onRetryFavorites,
  onShowFavorites,
  onBrowseNotes,
  loadMore,
}: SidebarProps) {
  const [recentOpen, setRecentOpen] = useState(true);
  const viewingFavorites = favoritesView && !isSearching;
  return (
    <aside className="sidebar" aria-label="Browse notes">
      <div className="browse-header">
        <div className="browse-pane-heading">
          <h2>{favoritesView ? "Favorites" : "Notes"}</h2>
          <PanelControl panel="browse" />
        </div>
        {favoritesView && (
          <p className="favorites-search-scope">
            Search covers all your notes.
          </p>
        )}
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
      {favoritesError && !isSearching && (favoritesView || recentFavorites) && (
        <div className="favorites-feedback" role="alert">
          Could not load favorites.{" "}
          <button
            type="button"
            className="secondary-btn"
            onClick={onRetryFavorites}
          >
            Retry
          </button>
        </div>
      )}

      <NoteList
        favorites={favorites}
        leading={
          <>
            {recentFavorites && !favoritesError && !favoritesLoading && (
              <section
                className="recent-favorites"
                aria-label="Recent favorites"
              >
                <div className="browse-favorites">
                  <button
                    className="workspace-icon-button"
                    type="button"
                    aria-label={
                      recentOpen
                        ? "Collapse recent favorites"
                        : "Show recent favorites"
                    }
                    aria-expanded={recentOpen}
                    aria-controls="recent-favorites-notes"
                    onClick={() => setRecentOpen(!recentOpen)}
                  >
                    <WorkspaceIcon name={recentOpen ? "down" : "chevron"} />
                  </button>
                  <span>
                    Favorites <small>{recentFavorites.length}</small>
                  </span>
                  <button
                    type="button"
                    className="favorites-view-all"
                    onClick={onShowFavorites}
                  >
                    View all
                  </button>
                </div>
                <div id="recent-favorites-notes" hidden={!recentOpen}>
                  {recentFavorites.slice(0, 5).map((note) => (
                    <NoteItem
                      key={note._id}
                      note={note}
                      favorites={favorites}
                      exactSearchQuery=""
                      isActive={note._id === selectedNoteId}
                      auxiliary
                      onView={() => onViewNote(note._id)}
                    />
                  ))}
                </div>
              </section>
            )}
            <div className="notes-toolbar">
              <span aria-live="polite">
                {isSearching
                  ? `${notes.length} ${notes.length === 1 ? "match" : "matches"}`
                  : viewingFavorites
                    ? favoritesError
                      ? "Favorites"
                      : `${notes.length} ${notes.length === 1 ? "favorite" : "favorites"}`
                    : "Recent notes"}
              </span>
            </div>
          </>
        }
        emptyContent={
          viewingFavorites && (
            <div className="empty-notes favorites-empty">
              {!favoritesError && (
                <>
                  <WorkspaceIcon name="star" />
                  <p>No favorites yet.</p>
                  <span>Star notes you want to revisit.</span>
                </>
              )}
              <button
                type="button"
                className="secondary-btn"
                onClick={onBrowseNotes}
              >
                Browse notes
              </button>
            </div>
          )
        }
        notes={notes}
        noteListRef={noteListRef}
        exactSearchQuery={exactSearchQuery}
        selectedNoteId={selectedNoteId}
        isLoading={isLoading}
        onViewNote={onViewNote}
        loadMore={loadMore}
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
