import NoteItem from './NoteItem';

export default function NoteList({ notes, selectedNoteId, isLoading, onViewNote, onEditNote, onDeleteNote, emptyMessage, emptyHint }) {
  if (isLoading) {
    return (
      <div className="notes-list">
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
      <div className="notes-list">
        <div className="empty-notes">
          <p>{emptyMessage}</p>
          <span>{emptyHint}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="notes-list">
      {notes.map(note => (
        <NoteItem
          key={note._id}
          note={note}
          isActive={note._id === selectedNoteId}
          onView={() => onViewNote(note._id)}
          onEdit={() => onEditNote(note)}
          onDelete={() => onDeleteNote(note)}
        />
      ))}
    </div>
  );
}
