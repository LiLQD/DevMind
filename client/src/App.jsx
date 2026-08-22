import React, { useEffect, useRef, useState } from 'react';
import './App.css';

// Components
import AuthPage from './components/AuthPage';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import NoteView from './components/NoteView';
import CreatePanel from './components/CreatePanel';
import Notification from './components/Notification';
import ConfirmModal from './components/ConfirmModal';
import SearchBar from './components/SearchBar';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

function App() {
  // --- Auth ---
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);

  // --- Data ---
  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [relatedNotes, setRelatedNotes] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // --- Collections & Tags ---
  const [collections, setCollections] = useState([]);
  const [selectedCollectionFilter, setSelectedCollectionFilter] = useState(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');

  // --- UI state ---
  const [theme, setTheme] = useState(localStorage.getItem('devmind-theme') || 'light');
  const [notification, setNotification] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // --- Loading states ---
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [isSearchingAI, setIsSearchingAI] = useState(false);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState(null);
  const [isLoadingNote, setIsLoadingNote] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isUpdatingNote, setIsUpdatingNote] = useState(false);
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);

  // --- Form states ---
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [query, setQuery] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState(null);

  // --- Refs ---
  const searchInputRef = useRef(null);
  const notificationTimerRef = useRef(null);

  // --- Notification helper ---
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

  // --- API helper ---
  const apiRequest = async (endpoint, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data.message || data.error?.message || 'Request failed');
    return data;
  };

  // --- Auth handlers ---
  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const payload = isLogin ? { email, password } : { email, password, name };
      const data = await apiRequest(endpoint, { method: 'POST', body: JSON.stringify(payload) });
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
    setCollections([]);
  };

  // --- Data fetching ---
  const fetchNotes = async () => {
    if (!token) return;
    setIsLoadingNotes(true);
    try {
      let url = '/notes';
      const params = new URLSearchParams();
      if (selectedTagFilter) params.append('tagId', selectedTagFilter);
      if (selectedCollectionFilter) params.append('collectionId', selectedCollectionFilter);
      if (params.toString()) url += '?' + params.toString();
      const data = await apiRequest(url);
      setNotes(Array.isArray(data) ? data : data.notes || data.data || []);
    } catch {
      showNotification('Failed to load notes.', 'error');
    } finally {
      setIsLoadingNotes(false);
    }
  };

  const fetchCollections = async () => {
    if (!token) return;
    try {
      const data = await apiRequest('/collections');
      setCollections(Array.isArray(data) ? data : data.data || []);
    } catch {
      // ignore
    }
  };

  const createCollection = async (name) => {
    if (!name.trim()) return null;
    try {
      const data = await apiRequest('/collections', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      const newCol = data.collection || data.data || data;
      setCollections(prev => [...prev, newCol]);
      showNotification('Collection created.', 'success');
      return newCol;
    } catch (err) {
      showNotification(err.message, 'error');
      return null;
    }
  };

  // --- Note CRUD ---
  const createNote = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      showNotification('Title and content are required.', 'error');
      return;
    }
    setIsCreatingNote(true);
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        tags: tagInput.split(',').map(s => s.trim()).filter(Boolean),
      };
      if (selectedCollectionId) payload.collection = selectedCollectionId;
      await apiRequest('/notes', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setTitle('');
      setContent('');
      setTagInput('');
      setSelectedCollectionId('');
      await fetchNotes();
      showNotification('Note created.', 'success');
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setIsCreatingNote(false);
    }
  };

  const updateNote = async (e) => {
    e.preventDefault();
    if (!selectedNote || !title.trim() || !content.trim()) {
      showNotification('Title and content are required.', 'error');
      return;
    }
    setIsUpdatingNote(true);
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        tags: tagInput.split(',').map(s => s.trim()).filter(Boolean),
      };
      if (selectedCollectionId) payload.collection = selectedCollectionId;
      const data = await apiRequest(`/notes/${selectedNote._id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      const updated = data.note || data.data || data;
      setSelectedNote(updated);
      setIsEditingNote(false);
      setTitle('');
      setContent('');
      setTagInput('');
      setSelectedCollectionId('');
      await fetchNotes();
      showNotification('Note updated.', 'success');
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setIsUpdatingNote(false);
    }
  };

  const deleteNote = async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget._id;
    setDeletingNoteId(targetId);
    try {
      await apiRequest(`/notes/${targetId}`, { method: 'DELETE' });
      if (selectedNote?._id === targetId) {
        setSelectedNote(null);
        setRelatedNotes([]);
      }
      setDeleteTarget(null);
      await fetchNotes();
      showNotification('Note deleted.', 'success');
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setDeletingNoteId(null);
    }
  };

  const viewNote = async (id) => {
    if (isEditingNote) cancelEditNote();
    setIsLoadingNote(true);
    setIsLoadingRelated(true);
    try {
      const data = await apiRequest(`/notes/${id}`);
      const note = data.note || data.data || data;
      setSelectedNote(note);
      setRelatedNotes(data.relatedNotes || note.relatedNotes || []);
    } catch {
      showNotification('Failed to load note.', 'error');
    } finally {
      setIsLoadingNote(false);
      setIsLoadingRelated(false);
    }
  };

  // --- Search ---
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
      if (results.length === 0) showNotification('No matching notes found.', 'info');
    } catch (err) {
      showNotification(err.message.includes('unavailable') ? 'Semantic search temporarily unavailable.' : err.message, 'error');
    } finally {
      setIsSearchingAI(false);
    }
  };

  const clearSearch = () => {
    setQuery('');
    setSearchResults([]);
    setIsSearching(false);
  };

  // --- Edit helpers ---
  const beginEditNote = (note) => {
    setSelectedNote(note);
    setIsEditingNote(true);
    setTitle(note.title || '');
    setContent(note.content || '');
    const tags = (note.tags || []).map(t => t.name || t).join(', ');
    setTagInput(tags);
    setSelectedCollectionId(note.collection?._id || note.collection || '');
    window.requestAnimationFrame(() => document.querySelector('#note-title')?.focus());
  };

  const cancelEditNote = () => {
    setIsEditingNote(false);
    setTitle('');
    setContent('');
    setTagInput('');
    setSelectedCollectionId('');
  };

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const isTyping = ['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase());
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); searchInputRef.current?.focus(); return; }
      if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); cancelEditNote(); window.requestAnimationFrame(() => document.querySelector('#note-title')?.focus()); return; }
      if (mod && e.key === 'Enter' && document.activeElement?.closest('.create-panel')) {
        e.preventDefault();
        document.querySelector('.create-form')?.requestSubmit();
        return;
      }
      if (mod && e.key === 'Delete' && selectedNote && !isTyping) {
        e.preventDefault();
        setDeleteTarget(selectedNote);
        return;
      }
      if (e.key === 'Escape') {
        if (deleteTarget) setDeleteTarget(null);
        else if (isEditingNote) cancelEditNote();
        else if (isSearching) clearSearch();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [deleteTarget, isSearching, isEditingNote, selectedNote]);

  // --- Effects ---
  useEffect(() => {
    if (token) {
      fetchNotes();
      fetchCollections();
    }
  }, [token, selectedTagFilter, selectedCollectionFilter]);

  // --- Auth screen ---
  if (!token) {
    return (
      <AuthPage
        isLogin={isLogin}
        setIsLogin={setIsLogin}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        name={name}
        setName={setName}
        onSubmit={handleAuth}
      />
    );
  }

  // --- Main app ---
  const displayNotes = isSearching ? searchResults : notes;

  return (
    <div className={`app-shell ${theme === 'dark' ? 'theme-dark' : ''}`}>
      <Notification notification={notification} onDismiss={() => setNotification(null)} />
      
      <TopBar
        notesCount={notes.length}
        userLabel={user?.name || user?.email || 'Account'}
        theme={theme}
        onToggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
        onLogout={handleLogout}
      />

      <div className="workspace">
        <Sidebar
          notes={displayNotes}
          selectedNoteId={selectedNote?._id}
          isLoading={isLoadingNotes}
          isSearching={isSearching}
          onViewNote={viewNote}
          onEditNote={beginEditNote}
          onDeleteNote={setDeleteTarget}
          collections={collections}
          selectedCollectionFilter={selectedCollectionFilter}
          setSelectedCollectionFilter={setSelectedCollectionFilter}
        />

        <main className="main-pane">
          <SearchBar
            query={query}
            setQuery={setQuery}
            onSearch={handleSearch}
            onClearSearch={clearSearch}
            isSearching={isSearching}
            isSearchingAI={isSearchingAI}
            searchInputRef={searchInputRef}
          />
          
          <NoteView
            selectedNote={selectedNote}
            relatedNotes={relatedNotes}
            isLoadingNote={isLoadingNote}
            isLoadingRelated={isLoadingRelated}
            onViewNote={viewNote}
            onDeleteNote={() => setDeleteTarget(selectedNote)}
            deletingNoteId={deletingNoteId}
          />
        </main>

        <CreatePanel
          isEditing={isEditingNote}
          title={title}
          setTitle={setTitle}
          content={content}
          setContent={setContent}
          tagInput={tagInput}
          setTagInput={setTagInput}
          onSubmit={isEditingNote ? updateNote : createNote}
          onCancel={cancelEditNote}
          isSaving={isEditingNote ? isUpdatingNote : isCreatingNote}
          submitLabel={isEditingNote ? 'Save changes' : 'Save note'}
          collections={collections}
          selectedCollectionId={selectedCollectionId}
          setSelectedCollectionId={setSelectedCollectionId}
          newCollectionName={newCollectionName}
          setNewCollectionName={setNewCollectionName}
          onCreateCollection={createCollection}
        />
      </div>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title={deleteTarget?.title || ''}
        onConfirm={deleteNote}
        onCancel={() => setDeleteTarget(null)}
        isDeleting={deletingNoteId === deleteTarget?._id}
      />
    </div>
  );
}

export default App;
