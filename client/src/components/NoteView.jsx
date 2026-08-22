export default function NoteView({ selectedNote, relatedNotes, isLoadingNote, isLoadingRelated, onViewNote, onDeleteNote, deletingNoteId }) {
  if (isLoadingNote) {
    return (
      <main className="main-pane">
        <div className="note-loading">
          <div className="skeleton-block skeleton-heading" />
          <div className="skeleton-block skeleton-paragraph" />
          <div className="skeleton-block skeleton-paragraph short" />
          <div className="skeleton-block skeleton-card" />
        </div>
      </main>
    );
  }

  if (!selectedNote) {
    return (
      <main className="main-pane">
        <div className="main-empty">
          <div className="main-empty-title">Select a note</div>
          <p>Choose a note from the sidebar, or create a new one on the right.</p>
        </div>
      </main>
    );
  }

  const collectionName = selectedNote.collection
    ? (typeof selectedNote.collection === 'object' ? selectedNote.collection.name : selectedNote.collection)
    : null;

  return (
    <main className="main-pane">
      <div className="note-view">
        <div className="note-title-row">
          <div>
            <div className="eyebrow">Note</div>
            <h1>{selectedNote.title}</h1>
            {collectionName && (
              <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-muted)' }}>
                📁 {collectionName}
              </div>
            )}
          </div>
          <button type="button" className="danger-btn" onClick={onDeleteNote} disabled={deletingNoteId === selectedNote._id}>
            {deletingNoteId === selectedNote._id ? 'Deleting…' : 'Delete'}
          </button>
        </div>

        <article className="note-content">{selectedNote.content}</article>

        <div className={`embedding-state ${selectedNote.embeddingStatus === 'failed' ? 'warning' : ''}`}>
          <span className="state-dot" />
          <span>
            {selectedNote.embeddingStatus === 'success' ? 'Ready for semantic search' :
             selectedNote.embeddingStatus === 'failed' ? 'Saved without embedding' :
             'Embedding in progress'}
          </span>
        </div>

        {(isLoadingRelated || relatedNotes.length > 0) && (
          <section className="related-section">
            <div className="section-heading">
              <div>
                <h2>Related notes</h2>
                <p>Based on semantic similarity</p>
              </div>
            </div>
            <div className="related-list">
              {isLoadingRelated ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div className="related-skeleton" key={i}>
                    <div className="skeleton-block related-skel-title" />
                    <div className="skeleton-block related-skel-score" />
                  </div>
                ))
              ) : relatedNotes.length === 0 ? (
                <div className="related-empty">No closely related notes found.</div>
              ) : (
                relatedNotes.map(item => {
                  const score = Math.round((item.similarityScore || 0) * 100);
                  return (
                    <button type="button" key={item._id} className="related-item" onClick={() => onViewNote(item._id)}>
                      <div className="related-main">
                        <span className="related-title">{item.title}</span>
                        {item.tags?.[0] && <span className="note-chip">{typeof item.tags[0] === 'object' ? item.tags[0].name : item.tags[0]}</span>}
                        {item.collection && (
                          <span className="note-chip">
                            📁 {typeof item.collection === 'object' ? item.collection.name : item.collection}
                          </span>
                        )}
                      </div>
                      <div className="related-score">
                        <span className="score-track">
                          <span className="score-fill" style={{ width: `${score}%` }} />
                        </span>
                        <strong>{score}%</strong>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
