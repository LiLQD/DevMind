import type { FavoriteControls } from "../features/favorites/FavoriteButton";
import type { Note } from "../types";

export type NoteListProps = {
  notes: Note[];
  noteListRef: Ref<HTMLDivElement>;
  exactSearchQuery: string;
  selectedNoteId?: string;
  isLoading: boolean;
  onViewNote: (id: string) => void;
  emptyMessage: string;
  emptyHint: string;
  favorites: FavoriteControls;
  leading?: ReactNode;
  emptyContent?: ReactNode;
  loadMore?: { loading: boolean; onLoad: () => void };
};

import NoteItem from "./NoteItem";

export default function NoteList({
  notes,
  noteListRef,
  exactSearchQuery,
  selectedNoteId,
  isLoading,
  onViewNote,
  emptyMessage,
  emptyHint,
  favorites,
  leading,
  emptyContent,
  loadMore,
}: NoteListProps) {
  if (isLoading) {
    return (
      <div className="notes-list" ref={noteListRef} aria-busy="true">
        {Array.from({ length: 7 }).map((_, i) => (
          <div className="note-skeleton" key={i}>
            <div className="skeleton-block skeleton-title-sm" />
            <div className="skeleton-block skeleton-meta-sm" />
          </div>
        ))}
      </div>
    );
  }

  if (notes.length === 0 && !loadMore) {
    return (
      <div className="notes-list" ref={noteListRef}>
        {leading}
        {emptyContent ?? (
          <div className="empty-notes">
            <p>{emptyMessage}</p>
            <span>{emptyHint}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="notes-list" ref={noteListRef}>
      {leading}
      {notes.map((note) => (
        <NoteItem
          key={note._id}
          note={note}
          exactSearchQuery={exactSearchQuery}
          isActive={note._id === selectedNoteId}
          onView={() => onViewNote(note._id)}
          favorites={favorites}
        />
      ))}
      {loadMore && (
        <button
          type="button"
          className="secondary-btn"
          disabled={loadMore.loading}
          onClick={loadMore.onLoad}
        >
          {loadMore.loading ? "Loading notes…" : "Load more notes"}
        </button>
      )}
    </div>
  );
}
import type { ReactNode, Ref } from "react";
