import React, { useState, useEffect } from 'react';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [notes, setNotes] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [currentNote, setCurrentNote] = useState(null);
  const [relatedNotes, setRelatedNotes] = useState([]);
  const [tags, setTags] = useState([]);
  const [collections, setCollections] = useState([]);
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [query, setQuery] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [activeTab, setActiveTab] = useState('notes');
  const [selectedTag, setSelectedTag] = useState(null);
  const [selectedCollection, setSelectedCollection] = useState(null);

  useEffect(() => {
    if (token) {
      fetchNotes();
      fetchTags();
      fetchCollections();
    }
  }, [token]);

  const apiRequest = async (endpoint, options = {}) => {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Request failed');
    return data;
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const data = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify({ email, password, name })
      });
      localStorage.setItem('token', data.token);
      setToken(data.token);
      setUser(data.user);
    } catch (error) {
      alert(error.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setNotes([]);
    setSearchResults([]);
  };

  const fetchNotes = async () => {
    try {
      let url = '/notes';
      if (selectedTag) url += `?tagId=${selectedTag}`;
      if (selectedCollection) url += `${selectedTag ? '&' : '?'}collectionId=${selectedCollection}`;
      const data = await apiRequest(url);
      setNotes(data);
    } catch (error) {
      console.error('Fetch notes error:', error);
    }
  };

  const fetchTags = async () => {
    try {
      const data = await apiRequest('/tags');
      setTags(data);
    } catch (error) {
      console.error('Fetch tags error:', error);
    }
  };

  const fetchCollections = async () => {
    try {
      const data = await apiRequest('/collections');
      setCollections(data);
    } catch (error) {
      console.error('Fetch collections error:', error);
    }
  };

  const createNote = async (e) => {
    e.preventDefault();
    if (!title || !content) {
      alert('Thiếu tiêu đề hoặc nội dung');
      return;
    }
    try {
      await apiRequest('/notes', {
        method: 'POST',
        body: JSON.stringify({ title, content })
      });
      setTitle('');
      setContent('');
      fetchNotes();
    } catch (error) {
      alert(error.message);
    }
  };

  const deleteNote = async (id) => {
    if (!confirm('Xóa ghi chú này?')) return;
    try {
      await apiRequest(`/notes/${id}`, { method: 'DELETE' });
      fetchNotes();
      if (currentNote?._id === id) setCurrentNote(null);
    } catch (error) {
      alert(error.message);
    }
  };

  const viewNote = async (id) => {
    try {
      const data = await apiRequest(`/notes/${id}`);
      setCurrentNote(data);
      setRelatedNotes(data.relatedNotes || []);
    } catch (error) {
      alert(error.message);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) {
      alert('Vui lòng nhập từ khóa');
      return;
    }
    try {
      const data = await apiRequest('/notes/search', {
        method: 'POST',
        body: JSON.stringify({ query })
      });
      setSearchResults(data.results || []);
      if (data.results?.length === 0) {
        alert('Không tìm thấy kết quả phù hợp');
      }
    } catch (error) {
      alert(error.message);
    }
  };

  const clearSearch = () => {
    setQuery('');
    setSearchResults([]);
  };

  if (!token) {
    return (
      <div className="auth-container">
        <div className="auth-box">
          <h1>📝 DevMind</h1>
          <p className="subtitle">Your second brain for developers</p>
          <form onSubmit={handleAuth}>
            <h3>{isLogin ? 'Welcome Back' : 'Create Account'}</h3>
            {!isLogin && (
              <input
                type="text"
                placeholder="Full Name"
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
            <p className="switch-auth" onClick={() => setIsLogin(!isLogin)}>
              {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
            </p>
          </form>
        </div>
      </div>
    );
  }

  const displayNotes = searchResults.length > 0 ? searchResults : notes;

  return (
    <div className="app">
      <header>
        <div className="header-left">
          <h1>📝 DevMind</h1>
          <span className="subtitle">Your second brain for developers</span>
        </div>
        <div className="header-right">
          <span className="user-name">{user?.name || user?.email}</span>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <div className="main-layout">
        {/* Left Sidebar */}
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <button 
              className={`nav-item ${activeTab === 'notes' ? 'active' : ''}`}
              onClick={() => { setActiveTab('notes'); clearSearch(); }}
            >
              📚 Notes
            </button>
            <button 
              className={`nav-item ${activeTab === 'tags' ? 'active' : ''}`}
              onClick={() => setActiveTab('tags')}
            >
              🏷️ Tags
            </button>
            <button 
              className={`nav-item ${activeTab === 'collections' ? 'active' : ''}`}
              onClick={() => setActiveTab('collections')}
            >
              📁 Collections
            </button>
          </nav>

          {activeTab === 'tags' && (
            <div className="sidebar-section">
              <h4>All Tags</h4>
              {tags.map(tag => (
                <div 
                  key={tag._id} 
                  className={`sidebar-item ${selectedTag === tag._id ? 'active' : ''}`}
                  onClick={() => { 
                    setSelectedTag(tag._id); 
                    setSelectedCollection(null);
                    setActiveTab('notes');
                    fetchNotes();
                  }}
                >
                  # {tag.name}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'collections' && (
            <div className="sidebar-section">
              <h4>Collections</h4>
              {collections.map(col => (
                <div 
                  key={col._id} 
                  className={`sidebar-item ${selectedCollection === col._id ? 'active' : ''}`}
                  onClick={() => { 
                    setSelectedCollection(col._id); 
                    setSelectedTag(null);
                    setActiveTab('notes');
                    fetchNotes();
                  }}
                >
                  📁 {col.name}
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="main-content">
          {/* Search Bar */}
          <div className="search-bar">
            <form onSubmit={handleSearch} className="search-form">
              <input
                type="text"
                placeholder="Search your notes..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit">🔍 Search</button>
              {searchResults.length > 0 && (
                <button type="button" className="clear-btn" onClick={clearSearch}>✕</button>
              )}
            </form>
            {(selectedTag || selectedCollection) && (
              <div className="filter-badge">
                Filtering by: {selectedTag ? tags.find(t => t._id === selectedTag)?.name : collections.find(c => c._id === selectedCollection)?.name}
                <button onClick={() => { setSelectedTag(null); setSelectedCollection(null); fetchNotes(); }}>✕</button>
              </div>
            )}
          </div>

          {/* Notes Grid */}
          <div className="notes-grid">
            {displayNotes.map(note => (
              <div 
                key={note._id} 
                className={`note-card ${currentNote?._id === note._id ? 'active' : ''}`}
                onClick={() => viewNote(note._id)}
              >
                <h3>{note.title}</h3>
                <p>{note.content?.substring(0, 120)}...</p>
                <div className="note-meta">
                  <span className="date">{new Date(note.createdAt).toLocaleDateString()}</span>
                  {note.embeddingStatus === 'success' && (
                    <span className="badge success">✓ Embedded</span>
                  )}
                  {note.similarityScore && (
                    <span className="badge score">
                      {Math.round(note.similarityScore * 100)}% match
                    </span>
                  )}
                </div>
                {note.tags?.length > 0 && (
                  <div className="note-tags">
                    {note.tags.map(tag => (
                      <span key={tag._id} className="tag">#{tag.name}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {displayNotes.length === 0 && (
              <div className="empty-state">
                <p>No notes yet. Create your first note!</p>
              </div>
            )}
          </div>
        </main>

        {/* Right Panel */}
        <aside className="right-panel">
          {/* Create Note */}
          <div className="create-note">
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
                rows={6}
                required
              />
              <button type="submit">Save Note</button>
            </form>
          </div>

          {/* Related Notes */}
          {currentNote && relatedNotes.length > 0 && (
            <div className="related-notes">
              <h4>Related Notes</h4>
              <p className="related-subtitle">Semantic matches</p>
              <div className="related-list">
                {relatedNotes.slice(0, 5).map(note => (
                  <div 
                    key={note._id} 
                    className="related-item"
                    onClick={() => viewNote(note._id)}
                  >
                    <span className="related-title">{note.title}</span>
                    <span className="related-score">
                      {Math.round(note.similarityScore * 100)}%
                    </span>
                  </div>
                ))}
              </div>
              {relatedNotes.length > 5 && (
                <button className="view-all-btn">
                  View all {relatedNotes.length} related notes
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default App;
