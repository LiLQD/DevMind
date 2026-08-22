import NoteList from './NoteList';

export default function Sidebar({
  notes,
  selectedNoteId,
  isLoading,
  isSearching,
  query,
  setQuery,
  onSearch,
  onClearSearch,
  onViewNote,
  onEditNote,
  onDeleteNote,
  searchInputRef,
  isSearchingAI,
  selectedTagFilter,
  setSelectedTagFilter,
}) {
  return (
    <aside className="sidebar">
      <div className="notes-toolbar">
        <span>{isSearching ? `${notes.length} matches` : 'Your notes'}</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isSearching && (
            <button type="button" className="text-btn" onClick={onClearSearch}>Clear</button>
          )}
        </div>
      </div>

      <div className="sidebar-search">
        <form onSubmit={onSearch} className="search-control">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search by meaning…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="search-input"
          />
          <button type="submit" className="search-submit" disabled={isSearchingAI}>
            {isSearchingAI ? '…' : 'Search'}
          </button>
        </form>
      </div>

      <NoteList
        notes={notes}
        selectedNoteId={selectedNoteId}
        isLoading={isLoading}
        onViewNote={onViewNote}
        onEditNote={onEditNote}
        onDeleteNote={onDeleteNote}
        emptyMessage={isSearching ? 'No notes matched your search.' : 'No notes yet.'}
        emptyHint={isSearching ? 'Try describing the idea instead of remembering exact keywords.' : 'Create your first note to start building your knowledge base.'}
      />
    </aside>
  );
}
