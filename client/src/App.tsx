import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Collection, Note, SearchResult } from "./types";
import "./App.css";

// Components
import AuthPage from "./components/AuthPage";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import NoteView from "./components/NoteView";
import CreatePanel from "./components/CreatePanel";
import Notification from "./components/Notification";
import ConfirmModal from "./components/ConfirmModal";
import SearchBar from "./components/SearchBar";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080/api";

type User = { name?: string; email?: string };
type NotificationState = {
  message: string;
  type: "info" | "success" | "error";
};
type NoteDetail = Note & { relatedNotes?: Note[] };
type NotePayload = {
  title: string;
  content: string;
  tags: string[];
  collections?: string[];
};
type ResourceResponse<T, Key extends string> = (
  | T
  | Record<Key, T>
  | { data: T }
) &
  Partial<Record<Key | "data", T>>;

function unwrapResource<T, Key extends string>(
  data: ResourceResponse<T, Key>,
  key: Key,
): T {
  return data[key] || data.data || (data as T);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

function App() {
  // --- Auth ---
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [user, setUser] = useState<User | null>(null);

  // --- Data ---
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [relatedNotes, setRelatedNotes] = useState<Note[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // --- Collections & Tags ---
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollectionFilter, setSelectedCollectionFilter] = useState<
    string | null
  >(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [newCollectionName, setNewCollectionName] = useState("");

  // --- UI state ---
  const [theme, setTheme] = useState(
    localStorage.getItem("devmind-theme") || "light",
  );
  const [notification, setNotification] = useState<NotificationState | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);

  // --- Loading states ---
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [isExportingNotes, setIsExportingNotes] = useState(false);
  const [isSearchingAI, setIsSearchingAI] = useState(false);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [isLoadingNote, setIsLoadingNote] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isUpdatingNote, setIsUpdatingNote] = useState(false);
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);

  // --- Form states ---
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [query, setQuery] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [selectedTagFilter] = useState<string | null>(null);

  // --- Refs ---
  const searchInputRef = useRef<HTMLInputElement>(null);
  const exportRequestRef = useRef<AbortController | null>(null);
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // --- Notification helper ---
  const showNotification = (
    message: string,
    type: NotificationState["type"] = "info",
  ) => {
    setNotification({ message, type });
    if (notificationTimerRef.current)
      clearTimeout(notificationTimerRef.current);
    notificationTimerRef.current = setTimeout(
      () => setNotification(null),
      4000,
    );
  };

  useEffect(
    () => () => {
      if (notificationTimerRef.current)
        clearTimeout(notificationTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("devmind-theme", theme);
  }, [theme]);

  // --- API helper ---
  const apiRequest = async <T,>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> => {
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    let data: unknown = {};
    try {
      data = await res.json();
    } catch {
      /* body không phải JSON */
    }
    if (!res.ok) {
      const body = data as {
        message?: string;
        error?: { message?: string };
      } | null;
      throw new Error(
        body?.message || body?.error?.message || "Request failed",
      );
    }
    return data as T;
  };

  // --- Auth handlers ---
  const handleAuth = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const endpoint = isLogin ? "/auth/login" : "/auth/register";
      const payload = isLogin ? { email, password } : { email, password, name };
      const data = await apiRequest<{ token?: string; user: User }>(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (data.token) {
        localStorage.setItem("token", data.token);
        setToken(data.token);
        setUser(data.user);
        setEmail("");
        setPassword("");
        setName("");
        showNotification(
          isLogin ? "Welcome back." : "Account created.",
          "success",
        );
      }
    } catch (err) {
      showNotification(errorMessage(err), "error");
    }
  };

  const handleLogout = () => {
    exportRequestRef.current?.abort();
    exportRequestRef.current = null;
    setIsExportingNotes(false);
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    setNotes([]);
    setSelectedNote(null);
    setRelatedNotes([]);
    setSearchResults([]);
    setIsSearching(false);
    setQuery("");
    setCollections([]);
  };

  const exportNotes = async () => {
    if (!token || exportRequestRef.current) return;

    const request = new AbortController();
    exportRequestRef.current = request;
    setIsExportingNotes(true);
    try {
      const allNotes = await apiRequest<Note[]>("/notes", {
        signal: request.signal,
      });
      if (request.signal.aborted) return;
      if (!Array.isArray(allNotes))
        throw new Error("Unexpected notes response");
      if (allNotes.length === 0) {
        showNotification("No notes to export.", "info");
        return;
      }

      const markdown = allNotes
        .map(({ title, content }) => {
          const heading = title.replace(/\s+/g, " ").trim();
          return `# ${heading}\n\n${content}`;
        })
        .join("\n\n---\n\n");
      const url = URL.createObjectURL(
        new Blob([markdown, "\n"], { type: "text/markdown;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "devmind-notes.md";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (!request.signal.aborted) {
        showNotification("Failed to export notes.", "error");
      }
    } finally {
      if (exportRequestRef.current === request) {
        exportRequestRef.current = null;
        setIsExportingNotes(false);
      }
    }
  };

  // --- Data fetching ---
  const fetchNotes = async () => {
    if (!token) return;
    setIsLoadingNotes(true);
    try {
      let url = "/notes";
      const params = new URLSearchParams();
      if (selectedTagFilter) params.append("tagId", selectedTagFilter);
      if (selectedCollectionFilter)
        params.append("collectionId", selectedCollectionFilter);
      if (params.toString()) url += "?" + params.toString();
      const data = await apiRequest<Note[] | { notes?: Note[]; data?: Note[] }>(
        url,
      );
      setNotes(Array.isArray(data) ? data : data.notes || data.data || []);
    } catch {
      showNotification("Failed to load notes.", "error");
    } finally {
      setIsLoadingNotes(false);
    }
  };

  const fetchCollections = async () => {
    if (!token) return;
    try {
      const data = await apiRequest<Collection[] | { data?: Collection[] }>(
        "/collections",
      );
      setCollections(Array.isArray(data) ? data : data.data || []);
    } catch {
      // ignore
    }
  };

  const createCollection = async (name: string) => {
    if (!name.trim()) return null;
    try {
      const data = await apiRequest<ResourceResponse<Collection, "collection">>(
        "/collections",
        {
          method: "POST",
          body: JSON.stringify({ name: name.trim() }),
        },
      );
      const newCol = unwrapResource<Collection, "collection">(
        data,
        "collection",
      );
      setCollections((prev) => [...prev, newCol]);
      showNotification("Collection created.", "success");
      return newCol;
    } catch (err) {
      showNotification(errorMessage(err), "error");
      return null;
    }
  };

  // --- Note CRUD ---
  const createNote = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      showNotification("Title and content are required.", "error");
      return;
    }
    setIsCreatingNote(true);
    try {
      const payload: NotePayload = {
        title: title.trim(),
        content: content.trim(),
        tags: tagInput
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      if (selectedCollectionId) payload.collections = [selectedCollectionId];
      await apiRequest("/notes", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setTitle("");
      setContent("");
      setTagInput("");
      setSelectedCollectionId("");
      await fetchNotes();
      showNotification("Note created.", "success");
    } catch (err) {
      showNotification(errorMessage(err), "error");
    } finally {
      setIsCreatingNote(false);
    }
  };

  const updateNote = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedNote || !title.trim() || !content.trim()) {
      showNotification("Title and content are required.", "error");
      return;
    }
    setIsUpdatingNote(true);
    try {
      const payload: NotePayload = {
        title: title.trim(),
        content: content.trim(),
        tags: tagInput
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      if (selectedCollectionId) payload.collections = [selectedCollectionId];
      const data = await apiRequest<ResourceResponse<Note, "note">>(
        `/notes/${selectedNote._id}`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
      );
      const updated = unwrapResource<Note, "note">(data, "note");
      setSelectedNote(updated);
      setIsEditingNote(false);
      setTitle("");
      setContent("");
      setTagInput("");
      setSelectedCollectionId("");
      await fetchNotes();
      showNotification("Note updated.", "success");
    } catch (err) {
      showNotification(errorMessage(err), "error");
    } finally {
      setIsUpdatingNote(false);
    }
  };

  const deleteNote = async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget._id;
    setDeletingNoteId(targetId);
    try {
      await apiRequest(`/notes/${targetId}`, { method: "DELETE" });
      if (selectedNote?._id === targetId) {
        setSelectedNote(null);
        setRelatedNotes([]);
      }
      setDeleteTarget(null);
      await fetchNotes();
      showNotification("Note deleted.", "success");
    } catch (err) {
      showNotification(errorMessage(err), "error");
    } finally {
      setDeletingNoteId(null);
    }
  };

  const viewNote = async (id: string) => {
    if (isEditingNote) cancelEditNote();
    setIsLoadingNote(true);
    setIsLoadingRelated(true);
    try {
      const data = await apiRequest<
        ResourceResponse<NoteDetail, "note"> & { relatedNotes?: Note[] }
      >(`/notes/${id}`);
      const note = unwrapResource<NoteDetail, "note">(data, "note");
      setSelectedNote(note);
      setRelatedNotes(data.relatedNotes || note.relatedNotes || []);
    } catch {
      showNotification("Failed to load note.", "error");
    } finally {
      setIsLoadingNote(false);
      setIsLoadingRelated(false);
    }
  };

  // --- Search ---
  const handleSearch = async (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (!query.trim()) {
      showNotification("Enter a search query.", "error");
      return;
    }
    setIsSearchingAI(true);
    try {
      const data = await apiRequest<{
        results?: SearchResult[];
        data?: SearchResult[];
      }>("/notes/search", {
        method: "POST",
        body: JSON.stringify({ query: query.trim() }),
      });
      const results = data.results || data.data || [];
      setSearchResults(results);
      setIsSearching(true);
      if (results.length === 0)
        showNotification("No matching notes found.", "info");
    } catch (err) {
      const message = errorMessage(err);
      showNotification(
        message.includes("unavailable")
          ? "Semantic search temporarily unavailable."
          : message,
        "error",
      );
    } finally {
      setIsSearchingAI(false);
    }
  };

  const clearSearch = () => {
    setQuery("");
    setSearchResults([]);
    setIsSearching(false);
  };

  // --- Edit helpers ---
  const beginEditNote = (note: Note) => {
    setSelectedNote(note);
    setIsEditingNote(true);
    setTitle(note.title || "");
    setContent(note.content || "");
    const tags = (note.tags || []).map((t) => t.name || t).join(", ");
    setTagInput(tags);
    const collectionId =
      typeof note.collection === "string"
        ? note.collection
        : note.collection?._id || "";
    setSelectedCollectionId(collectionId);
    window.requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>("#note-title")?.focus(),
    );
  };
  const cancelEditNote = () => {
    setIsEditingNote(false);
    setTitle("");
    setContent("");
    setTagInput("");
    setSelectedCollectionId("");
    setNewCollectionName("");
  };

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const isTyping = ["input", "textarea"].includes(
        document.activeElement?.tagName?.toLowerCase() ?? "",
      );
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        cancelEditNote();
        window.requestAnimationFrame(() =>
          document.querySelector<HTMLInputElement>("#note-title")?.focus(),
        );
        return;
      }
      if (
        mod &&
        e.key === "Enter" &&
        document.activeElement?.closest(".create-panel")
      ) {
        e.preventDefault();
        document
          .querySelector<HTMLFormElement>(".create-form")
          ?.requestSubmit();
        return;
      }
      if (mod && e.key === "Delete" && selectedNote && !isTyping) {
        e.preventDefault();
        setDeleteTarget(selectedNote);
        return;
      }
      if (e.key === "Escape") {
        if (deleteTarget) setDeleteTarget(null);
        else if (isEditingNote) cancelEditNote();
        else if (isSearching) clearSearch();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [deleteTarget, isSearching, isEditingNote, selectedNote]);

  // --- Effects ---
  useEffect(() => {
    if (token) {
      // oxlint-disable-next-line react/set-state-in-effect
      fetchNotes();
      fetchCollections();
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
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
    <div className={`app-shell ${theme === "dark" ? "theme-dark" : ""}`}>
      <Notification
        notification={notification}
        onDismiss={() => setNotification(null)}
      />

      <TopBar
        onExportNotes={exportNotes}
        isExportingNotes={isExportingNotes}
        notesCount={notes.length}
        userLabel={user?.name || user?.email || "Account"}
        theme={theme}
        onToggleTheme={() =>
          setTheme((t) => (t === "light" ? "dark" : "light"))
        }
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
          key={isEditingNote ? "edit" : "new"}
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
          submitLabel={isEditingNote ? "Save changes" : "Save note"}
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
        title={deleteTarget?.title || ""}
        onConfirm={deleteNote}
        onCancel={() => setDeleteTarget(null)}
        isDeleting={deletingNoteId === deleteTarget?._id}
      />
    </div>
  );
}

export default App;
