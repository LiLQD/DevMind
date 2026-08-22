import React from 'react';
import NoteList from './NoteList';

export default function Sidebar({
  notes,
  selectedNoteId,
  isLoading,
  isSearching,
  onViewNote,
  onEditNote,
  onDeleteNote,
  selectedCollectionFilter,
  setSelectedCollectionFilter,
  collections = [],
}) {
  return (
    <aside className="sidebar">
      <div className="notes-toolbar">
        <span>
          {isSearching ? `${notes.length} matches` : 'Your notes'}
        </span>

        <div className="sidebar-filters">
          {!isSearching && collections.length > 0 && (
            <select
              aria-label="Filter notes by collection"
              value={selectedCollectionFilter || ''}
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
        selectedNoteId={selectedNoteId}
        isLoading={isLoading}
        onViewNote={onViewNote}
        onEditNote={onEditNote}
        onDeleteNote={onDeleteNote}
        emptyMessage={
          isSearching
            ? 'No notes matched your search.'
            : 'No notes yet.'
        }
        emptyHint={
          isSearching
            ? 'Try describing the idea instead of remembering exact keywords.'
            : 'Create your first note to start building your knowledge base.'
        }
      />
    </aside>
  );
}
