import React, { useState, useEffect } from 'react';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

function App() {
  // Auth state
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);

  // Data states
  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [relatedNotes, setRelatedNotes] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLogin, setIsLogin] = useState(true);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [query, setQuery] = useState('');

  // --- API helper ---
  const apiRequest = async (endpoint, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers,
    };
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error?.message || 'Request failed');
    }
    return data;
  };

  // --- Auth ---
  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const payload = isLogin ? { email, password } : { email, password, name };
      const data = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (data.token) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setUser(data.user);
        setEmail('');
        setPassword('');
        setName('');
        // clear any previous notes
        setNotes([]);
        setSelectedNote(null);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setNotes([]);
    setSelectedNote(null);
    setSearchResults([]);
    setIsSearching(false);
  };

  // --- Notes ---
  const fetchNotes = async () => {
    try {
      const data = await apiRequest('/notes');
      setNotes(data);
    } catch (err) {
      console.error('Fetch notes error:', err);
    }
  };

  const createNote = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      alert('Title and content are required');
      return;
    }
    try {
      await apiRequest('/notes', {
        method: 'POST',
        body: JSON.stringify({ title, content }),
      });
      setTitle('');
      setContent('');
      fetchNotes();
    } catch (err) {
      alert(err.message);
    }
  };

  const deleteNote = async (id) => {
    if (!confirm('Delete this note?')) return;
    try {
      await apiRequest(`/notes/${id}`, { method: 'DELETE' });
      if (selectedNote?._id === id) {
        setSelectedNote(null);
        setRelatedNotes([]);
      }
      fetchNotes();
    } catch (err) {
      alert(err.message);
    }
  };

  const viewNote = async (id) => {
    try {
      const data = await apiRequest(`/notes/${id}`);
      setSelectedNote(data);
      setRelatedNotes(data.relatedNotes || []);
    } catch (err) {
      alert(err.message);
    }
  };

  // --- Search ---
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) {
      alert('Please enter a search query');
      return;
    }
    try {
      const data = await apiRequest('/notes/search', {
        method: 'POST',
        body: JSON.stringify({ query }),
      });
      setSearchResults(data.results || []);
      setIsSearching(true);
      if (data.results?.length === 0) {
        alert('No matching notes found');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const clearSearch = () => {
    setQuery('');
    setSearchResults([]);
    setIsSearching(false);
  };

  // --- Load notes when token changes ---
  useEffect(() => {
    if (token) {
      fetchNotes();
    }
  }, [token]);

  // --- Login screen ---
  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-box">
          <h1>DevMind</h1>
          <p className="subtitle">Your second brain for developers</p>
          <form onSubmit={handleAuth}>
            <h3>{isLogin ? 'Sign In' : 'Create Account'}</h3>
            {!isLogin && (
              <input
                type="text"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit">{isLogin ? 'Sign In' : 'Sign Up'}</button>
            <p className="switch-link" onClick={() => setIsLogin(!isLogin)}>
              {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
            </p>
          </form>
        </div>
      </div>
    );
  }

  // --- Main app ---
  const displayNotes = isSearching ? searchResults : notes;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>DevMind</h1>
          <span className="header-subtitle">Your second brain for developers</span>
        </div>
        <div className="header-right">
          <span className="user-name">{user?.name || user?.email}</span>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <div className="app-body">
        {/* Sidebar - Notes list */}
        <aside className="sidebar">
          <div className="search-section">
            <form onSubmit={handleSearch} className="search-form">
              <input
                type="text"
                placeholder="Search notes..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit">Search</button>
              {isSearching && (
                <button type="button" className="clear-btn" onClick={clearSearch}>✕</button>
              )}
            </form>
          </div>
          <div className="notes-list">
            {displayNotes.length === 0 ? (
              <p className="empty-notes">No notes yet. Create one!</p>
            ) : (
              displayNotes.map((note) => (
                <div
                  key={note._id}
                  className={`note-item ${selectedNote?._id === note._id ? 'active' : ''}`}
                  onClick={() => viewNote(note._id)}
                >
                  <h4>{note.title}</h4>
                  <div className="note-meta">
                    <span className="date">{new Date(note.createdAt).toLocaleDateString()}</span>
                    {note.embeddingStatus === 'success' && (
                      <span className="badge">embedded</span>
                    )}
                    {note.similarityScore && (
                      <span className="badge score">
                        {Math.round(note.similarityScore * 100)}% match
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Main content - selected note */}
        <main className="main-content">
          {selectedNote ? (
            <div className="note-detail">
              <div className="note-header">
                <h2>{selectedNote.title}</h2>
                <button className="delete-btn" onClick={() => deleteNote(selectedNote._id)}>
                  Delete
                </button>
              </div>
              <div className="note-body">
                <p>{selectedNote.content}</p>
              </div>
              <div className="note-footer">
                <span>Status: {selectedNote.embeddingStatus}</span>
                {selectedNote.embeddingStatus === 'success' && (
                  <span> ✓ Embedded</span>
                )}
              </div>

              {relatedNotes.length > 0 && (
                <div className="related-notes">
                  <h4>Related notes (semantic matches)</h4>
                  <ul>
                    {relatedNotes.map((rn) => (
                      <li key={rn._id} onClick={() => viewNote(rn._id)}>
                        <span>{rn.title}</span>
                        <span className="related-score">
                          {Math.round(rn.similarityScore * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <p>Select a note to view its content.</p>
            </div>
          )}
        </main>

        {/* Right panel - Create note */}
        <aside className="create-panel">
          <h3>New Note</h3>
          <form onSubmit={createNote}>
            <input
              type="text"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
            />
            <textarea
              placeholder="Content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              required
            />
            <button type="submit">Save Note</button>
          </form>
        </aside>
      </div>
    </div>
  );
}

export default App;
