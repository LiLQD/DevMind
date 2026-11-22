import type { Note } from "../types";

export type NoteListProps = {
  notes: Note[];
  noteListRef: Ref<HTMLDivElement>;
  exactSearchQuery: string;
  selectedNoteId?: string;
  isLoading: boolean;
  onViewNote: (id: string) => void;
  onEditNote: (note: Note) => void;
  onDeleteNote: (note: Note) => void;
  emptyMessage: string;
  emptyHint: string;
};

import NoteItem from "./NoteItem";

export default function NoteList({
  notes,
  noteListRef,
  exactSearchQuery,
  selectedNoteId,
  isLoading,
  onViewNote,
  onEditNote,
  onDeleteNote,
  emptyMessage,
  emptyHint,
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

  if (notes.length === 0) {
    return (
      <div className="notes-list" ref={noteListRef}>
        <div className="empty-notes">
          <p>{emptyMessage}</p>
          <span>{emptyHint}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="notes-list" ref={noteListRef}>
      {notes.map((note) => (
        <NoteItem
          key={note._id}
          note={note}
          exactSearchQuery={exactSearchQuery}
          isActive={note._id === selectedNoteId}
          onView={() => onViewNote(note._id)}
          onEdit={() => onEditNote(note)}
          onDelete={() => onDeleteNote(note)}
        />
      ))}
    </div>
  );
}
import type { Ref } from "react";
