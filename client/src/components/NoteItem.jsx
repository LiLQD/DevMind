export default function NoteItem({ note, isActive, onView, onEdit, onDelete }) {
  return (
    <div className={`note-item ${isActive ? 'active' : ''}`} onClick={onView} role="button" tabIndex={0}>
      <div className="note-item-top">
        <h3>{note.title}</h3>
        <div className="note-item-actions">
          <span className={`status-dot ${note.embeddingStatus === 'failed' ? 'failed' : ''}`} title={note.embeddingStatus === 'failed' ? 'Saved without embedding' : 'Ready for semantic search'} />
          <button type="button" className="row-action edit-action" onClick={e => { e.stopPropagation(); onEdit(); }}>Edit</button>
          <button type="button" className="row-action delete-action" onClick={e => { e.stopPropagation(); onDelete(); }}>Delete</button>
        </div>
      </div>
      <div className="note-item-bottom">
        <span>{new Date(note.createdAt).toLocaleDateString()}</span>
        {note.tags?.[0] && <span className="note-chip">{typeof note.tags[0] === 'object' ? note.tags[0].name : note.tags[0]}</span>}
        {note.collection && (
          <span className="note-chip">
            📁 {typeof note.collection === 'object' ? note.collection.name : note.collection}
          </span>
        )}
        {note.similarityScore != null && <span className="score-chip">{Math.round(note.similarityScore * 100)}%</span>}
      </div>
    </div>
  );
}
