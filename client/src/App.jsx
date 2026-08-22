import React, { useEffect, useRef, useState } from 'react';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);

  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [relatedNotes, setRelatedNotes] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [isSearchingAI, setIsSearchingAI] = useState(false);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [isDeletingNote, setIsDeletingNote] = useState(false);
  const [isLoadingNote, setIsLoadingNote] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isUpdatingNote, setIsUpdatingNote] = useState(false);
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);

  const [notification, setNotification] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem('devmind-theme') || 'light');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLogin, setIsLogin] = useState(true);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [query, setQuery] = useState('');

  const searchInputRef = useRef(null);
  const notificationTimerRef = useRef(null);

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
    notificationTimerRef.current = setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => () => {
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('devmind-theme', theme);
  }, [theme]);

  const apiRequest = async (endpoint, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) {
      throw new Error(data.message || data.error?.message || 'Request failed');
    }

    return data;
  };

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
        showNotification(isLogin ? 'Welcome back.' : 'Account created.', 'success');
      }
    } catch (err) {
      showNotification(err.message, 'error');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setNotes([]);
    setSelectedNote(null);
    setRelatedNotes([]);
    setSearchResults([]);
    setIsSearching(false);
    setQuery('');
  };

  const fetchNotes = async () => {
    if (!token) return;
    setIsLoadingNotes(true);

    try {
      const data = await apiRequest('/notes');
      setNotes(Array.isArray(data) ? data : data.notes || data.data || []);
    } catch {
      showNotification('Failed to load notes.', 'error');
    } finally {
      setIsLoadingNotes(false);
    }
  };

  const createNote = async (e) => {
    e.preventDefault();

    if (!title.trim() || !content.trim()) {
      showNotification('Title and content are required.', 'error');
      return;
    }

    setIsCreatingNote(true);

    try {
      await apiRequest('/notes', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
        }),
      });

      setTitle('');
      setContent('');
      await fetchNotes();
      showNotification('Note created.', 'success');
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setIsCreatingNote(false);
    }
  };

  const beginEditNote = (note) => {
    setSelectedNote(note);
    setIsEditingNote(true);
    setTitle(note.title || '');
    setContent(note.content || '');
    window.requestAnimationFrame(() => {
      document.querySelector('#note-title')?.focus();
    });
  };

  const cancelEditNote = () => {
    setIsEditingNote(false);
    setTitle('');
    setContent('');
  };

  const updateNote = async (e) => {
    e.preventDefault();

    if (!selectedNote || !title.trim() || !content.trim()) {
      showNotification('Title and content are required.', 'error');
      return;
    }

    setIsUpdatingNote(true);

    try {
      const data = await apiRequest(`/notes/${selectedNote._id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
        }),
      });

      const updated = data.note || data.data || data;
      setSelectedNote(updated);
      setIsEditingNote(false);
      setTitle('');
      setContent('');
      await fetchNotes();
      showNotification('Note updated.', 'success');
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setIsUpdatingNote(false);
    }
  };

  const requestDeleteNote = (note) => setDeleteTarget(note);

  const deleteNote = async () => {
    if (!deleteTarget) return;

    setIsDeletingNote(true);

    try {
      await apiRequest(`/notes/${deleteTarget._id}`, { method: 'DELETE' });

      if (selectedNote?._id === deleteTarget._id) {
        setSelectedNote(null);
        setRelatedNotes([]);
      }

      setDeleteTarget(null);
      await fetchNotes();
      showNotification('Note deleted.', 'success');
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setIsDeletingNote(false);
    }
  };

  const viewNote = async (id) => {
    if (isEditingNote) {
      cancelEditNote();
    }

    setIsLoadingNote(true);
    setIsLoadingRelated(true);

    try {
      const data = await apiRequest(`/notes/${id}`);
      const note = data.note || data.data || data;
      setSelectedNote(note);
      setRelatedNotes([]);
      setRelatedNotes(data.relatedNotes || note.relatedNotes || []);
    } catch {
      showNotification('Failed to load note.', 'error');
    } finally {
      setIsLoadingNote(false);
      setIsLoadingRelated(false);
    }
  };

  const handleSearch = async (e) => {
    e?.preventDefault();

    if (!query.trim()) {
      showNotification('Enter a search query.', 'error');
      return;
    }

    setIsSearchingAI(true);

    try {
      const data = await apiRequest('/notes/search', {
        method: 'POST',
        body: JSON.stringify({ query: query.trim() }),
      });

      const results = data.results || data.data || [];
      setSearchResults(results);
      setIsSearching(true);

      if (results.length === 0) {
        showNotification('No matching notes found.', 'info');
      }
    } catch (err) {
      if (err.message.toLowerCase().includes('unavailable')) {
        showNotification('Semantic search is temporarily unavailable.', 'error');
      } else {
        showNotification(err.message, 'error');
      }
    } finally {
      setIsSearchingAI(false);
    }
  };

  const clearSearch = () => {
    setQuery('');
    setSearchResults([]);
    setIsSearching(false);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable;

      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        cancelEditNote();
        window.requestAnimationFrame(() => document.querySelector('#note-title')?.focus());
        return;
      }

      if (mod && e.key === 'Enter' && document.activeElement?.closest('.create-panel')) {
        e.preventDefault();
        document.querySelector('.create-form')?.requestSubmit();
        return;
      }

      if (mod && e.key === 'Delete' && selectedNote && !isTyping) {
        e.preventDefault();
        requestDeleteNote(selectedNote);
        return;
      }

      if (e.key === 'Escape') {
        if (deleteTarget) {
          setDeleteTarget(null);
        } else if (isEditingNote) {
          cancelEditNote();
        } else if (isSearching) {
          clearSearch();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [deleteTarget, isSearching, isEditingNote, selectedNote]);

  useEffect(() => {
    if (token) fetchNotes();
  }, [token]);

  useEffect(() => {
    if (!selectedNote && isEditingNote) {
      cancelEditNote();
    }
  }, [selectedNote, isEditingNote]);

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-box">
          <div className="auth-brand">
            <h1>DevMind</h1>
            <p>Your second brain for developers</p>
          </div>

          <form onSubmit={handleAuth} className="auth-form">
            <div>
              <h2>{isLogin ? 'Sign in' : 'Create account'}</h2>
              <p className="auth-note">
                {isLogin
                  ? 'Access your personal technical knowledge.'
                  : 'Start building your developer knowledge base.'}
              </p>
            </div>

            {!isLogin && (
              <label>
                <span>Name</span>
                <input
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
            )}

            <label>
              <span>Email</span>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label>
              <span>Password</span>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>

            <button type="submit" className="primary-btn">
              {isLogin ? 'Sign in' : 'Create account'}
            </button>

            <button
              type="button"
              className="text-btn auth-switch"
              onClick={() => setIsLogin((value) => !value)}
            >
              {isLogin ? 'Create an account' : 'Back to sign in'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const displayNotes = isSearching ? searchResults : notes;
  const userLabel = user?.name || user?.email || 'Account';

  const NoteSkeleton = () => (
    <div className="note-skeleton">
      <div className="skeleton-block skeleton-title-sm" />
      <div className="skeleton-block skeleton-meta-sm" />
    </div>
  );

  return (
    <div className={`app-shell ${theme === 'dark' ? 'theme-dark' : ''}`}>
      {notification && (
        <div className={`notification ${notification.type}`} role="status">
          <span className="notification-marker" />
          <span>{notification.message}</span>
          <button
            type="button"
            className="notification-close"
            aria-label="Dismiss"
            onClick={() => setNotification(null)}
          >
            ×
          </button>
        </div>
      )}

      <header className="topbar">
        <div className="topbar-left">
          <div className="brand-lockup">
            <span className="brand-name">DevMind</span>
            <span className="brand-tagline">Your second brain for developers</span>
          </div>
          <span className="note-count">{notes.length} notes</span>
        </div>

        <div className="topbar-right">
          <button
            type="button"
            className="theme-btn"
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            onClick={() => setTheme((value) => (value === 'light' ? 'dark' : 'light'))}
          >
            {theme === 'light' ? 'Dark' : 'Light'}
          </button>
          <span className="account-label">{userLabel}</span>
          <button type="button" className="secondary-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-search">
            <form onSubmit={handleSearch} className="search-form">
              <label className="search-label" htmlFor="search-notes">
                Search your notes
              </label>

              <div className="search-control search-control-large">
                <textarea
                  id="search-notes"
                  ref={searchInputRef}
                  placeholder="Describe what you remember… e.g. “How do I prevent duplicate requests when the client retries?”"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="search-input search-textarea"
                  maxLength={1000}
                  rows={3}
                  autoComplete="off"
                />

                {query && (
                  <button
                    type="button"
                    className="clear-search"
                    aria-label="Clear search"
                    onClick={clearSearch}
                  >
                    ×
                  </button>
                )}

                <button type="submit" className="search-submit" disabled={isSearchingAI}>
                  {isSearchingAI ? 'Searching…' : 'Search'}
                </button>
              </div>

              <div className="search-meta">
                <span>Natural language · up to 1,000 characters</span>
                <div className="search-shortcuts">
                  <span>⌘/Ctrl K</span>
                  <span>Enter to search</span>
                </div>
              </div>
            </form>
          </div>

          <div className="notes-toolbar">
            <span>{isSearching ? `${displayNotes.length} matches` : 'Your notes'}</span>
            {isSearching && (
              <button type="button" className="text-btn" onClick={clearSearch}>
                Clear
              </button>
            )}
          </div>

          <div className="notes-list">
            {isLoadingNotes ? (
              Array.from({ length: 7 }).map((_, index) => <NoteSkeleton key={index} />)
            ) : displayNotes.length === 0 ? (
              <div className="empty-notes">
                <p>{isSearching ? 'No notes matched your search.' : 'No notes yet.'}</p>
                <span>
                  {isSearching
                    ? 'Try describing the idea instead of remembering exact keywords.'
                    : 'Create your first note to start building your knowledge base.'}
                </span>
              </div>
            ) : (
              displayNotes.map((note) => (
                <div
                  key={note._id}
                  className={`note-item ${
                    selectedNote?._id === note._id ? 'active' : ''
                  }`}
                  onClick={() => viewNote(note._id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      viewNote(note._id);
                    }
                  }}
                >
                  <div className="note-item-top">
                    <h3>{note.title}</h3>
                    <div className="note-item-actions">
                      <span
                        className={`status-dot ${
                          note.embeddingStatus === 'failed' ? 'failed' : ''
                        }`}
                        title={
                          note.embeddingStatus === 'failed'
                            ? 'Saved without embedding'
                            : 'Ready for semantic search'
                        }
                      />
                      <button
                        type="button"
                        className="row-action edit-action"
                        aria-label={`Edit ${note.title}`}
                        title="Edit note"
                        onClick={(e) => {
                          e.stopPropagation();
                          beginEditNote(note);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="row-action delete-action"
                        aria-label={`Delete ${note.title}`}
                        title="Delete note"
                        onClick={(e) => {
                          e.stopPropagation();
                          requestDeleteNote(note);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="note-item-bottom">
                    <span>{new Date(note.createdAt).toLocaleDateString()}</span>
                    {note.tags?.[0] && <span className="note-chip">{note.tags[0]}</span>}
                    {note.similarityScore != null && (
                      <span className="score-chip">
                        {Math.round(note.similarityScore * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        <main className="main-pane">
          {isLoadingNote ? (
            <div className="note-loading">
              <div className="skeleton-block skeleton-heading" />
              <div className="skeleton-block skeleton-paragraph" />
              <div className="skeleton-block skeleton-paragraph short" />
              <div className="skeleton-block skeleton-card" />
            </div>
          ) : selectedNote ? (
            <div className="note-view">
              <div className="note-title-row">
                <div>
                  <div className="eyebrow">Note</div>
                  <h1>{selectedNote.title}</h1>
                </div>

                <button
                  type="button"
                  className="danger-btn"
                  onClick={() => requestDeleteNote(selectedNote)}
                  disabled={isDeletingNote}
                >
                  {isDeletingNote ? 'Deleting…' : 'Delete'}
                </button>
              </div>

              <article className="note-content">{selectedNote.content}</article>

              <div
                className={`embedding-state ${
                  selectedNote.embeddingStatus === 'failed' ? 'warning' : ''
                }`}
              >
                <span className="state-dot" />
                <span>
                  {selectedNote.embeddingStatus === 'success'
                    ? 'Ready for semantic search'
                    : selectedNote.embeddingStatus === 'failed'
                      ? 'Saved without embedding'
                      : 'Embedding in progress'}
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
                      Array.from({ length: 4 }).map((_, index) => (
                        <div className="related-skeleton" key={index}>
                          <div className="skeleton-block related-skel-title" />
                          <div className="skeleton-block related-skel-score" />
                        </div>
                      ))
                    ) : relatedNotes.length === 0 ? (
                      <div className="related-empty">No closely related notes found.</div>
                    ) : relatedNotes.map((item) => {
                      const score = Math.round((item.similarityScore || 0) * 100);

                      return (
                        <button
                          type="button"
                          key={item._id}
                          className="related-item"
                          onClick={() => viewNote(item._id)}
                        >
                          <div className="related-main">
                            <span className="related-title">{item.title}</span>
                            {item.tags?.[0] && (
                              <span className="note-chip">{item.tags[0]}</span>
                            )}
                          </div>

                          <div className="related-score">
                            <span className="score-track">
                              <span
                                className="score-fill"
                                style={{ width: `${score}%` }}
                              />
                            </span>
                            <strong>{score}%</strong>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="main-empty">
              <div className="main-empty-title">Select a note</div>
              <p>Choose a note from the sidebar, or create a new one on the right.</p>
            </div>
          )}
        </main>

        <aside className="create-panel">
          <div className="create-header">
            <div>
              <div className="eyebrow">{isEditingNote ? 'Edit note' : 'Quick capture'}</div>
              <h2>{isEditingNote ? 'Edit note' : 'New note'}</h2>
            </div>
            {isEditingNote && (
              <button type="button" className="text-btn" onClick={cancelEditNote}>
                Cancel
              </button>
            )}
          </div>

          <form onSubmit={isEditingNote ? updateNote : createNote} className="create-form">
            <label className="form-field">
              <span>Title</span>
              <input
                type="text"
                placeholder="Understanding idempotency…"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
              />
            </label>

            <label className="form-field form-field-grow">
              <span>Content</span>
              <textarea
                placeholder="Write the idea, fix, snippet, or reference you want to remember…"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              />
            </label>

            <div className="create-footer">
              <span className="create-hint">
                <kbd>⌘ Enter</kbd> to save · <kbd>Esc</kbd> to cancel
              </span>

              <button
                type="submit"
                className="primary-btn save-btn"
                disabled={isCreatingNote || isUpdatingNote}
              >
                {isEditingNote
                  ? (isUpdatingNote ? 'Saving…' : 'Save changes')
                  : (isCreatingNote ? 'Creating…' : 'Save note')}
              </button>
            </div>
          </form>
        </aside>
      </div>

      {deleteTarget && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <div>
              <div className="eyebrow">Delete note</div>
              <h2 id="delete-title">Delete “{deleteTarget.title}”?</h2>
              <p>This action cannot be undone.</p>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeletingNote}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-solid-btn"
                onClick={deleteNote}
                disabled={isDeletingNote}
              >
                {isDeletingNote ? 'Deleting…' : 'Delete note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
