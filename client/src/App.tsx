import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Collection, Note, SearchMode } from "./types";
import "./App.css";

// Components
import AuthPage from "./components/AuthPage";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import NoteView from "./components/NoteView";
import CreatePanel from "./components/CreatePanel";
import Notification from "./components/Notification";
import ConfirmModal from "./components/ConfirmModal";
import PlanPanel from "./components/PlanPanel";
import BulkImportPanel from "./features/bulk-import/BulkImportPanel";
import SearchBar from "./components/SearchBar";
import {
  authenticateCookieSession,
  CookieAuthError,
  cookieSessionChannel,
  cookieWorkspaceRequest,
  logoutCookieSession,
  needsCookieSignIn,
  restoreCookieSession,
} from "./features/auth/cookie-session";
import type { CookieSession } from "./features/auth/cookie-session";

const mockCheckoutEnabled = import.meta.env.VITE_ENABLE_MOCK_BILLING === "true";
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
type DraftFields = {
  title: string;
  content: string;
  tags: string;
  collectionId: string;
};
type Editor = { note: Note | null; initial: DraftFields; version: number };

function draftFields(note?: Note): DraftFields {
  const legacyCollection = note?.collection;
  return {
    title: note?.title || "",
    content: note?.content || "",
    tags: note?.tags?.map((tag) => tag.name || tag).join(", ") || "",
    collectionId:
      note?.collections?.[0]?._id ||
      (typeof legacyCollection === "string"
        ? legacyCollection
        : legacyCollection?._id) ||
      "",
  };
}
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

function authResponseError(status: number, message: string, isLogin: boolean) {
  if (isLogin && status === 401) return "Email or password is incorrect.";
  if (!isLogin && status === 400 && message === "Email đã tồn tại") {
    return "An account with this email already exists.";
  }
  if (status === 429) return "Too many attempts. Please try again later.";
  if (status === 400 || status === 422) {
    return message || "Check the information you entered and try again.";
  }
  return isLogin
    ? "Unable to sign in. Please try again."
    : "Unable to create your account. Please try again.";
}

function App() {
  // --- Auth ---
  const [{ cookie, requests }, setSession] = useState(() => ({
    cookie: null as CookieSession | null,
    requests: new AbortController(),
  }));
  const sessionKey = cookie?.sessionId;
  const sessionSignal = requests.signal;
  const [user, setUser] = useState<User | null>(null);
  const [cookieAction, setCookieAction] = useState<
    "restoring" | "restore-error" | "signing-out" | "logout-error" | null
  >("restoring");
  const cookieChannelRef = useRef<BroadcastChannel | null>(null);
  const logoutTargetRef = useRef<CookieSession | null>(null);
  const draftOwnerRef = useRef<string | null>(null);
  const [authError, setAuthError] = useState("");
  const [isAuthPending, setIsAuthPending] = useState(false);
  const authPendingRef = useRef(false);
  const [bulkImportAccess, setBulkImportAccess] = useState<{
    sessionKey: string;
    allowed: boolean;
  } | null>(null);

  // --- Data ---
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [relatedNotes, setRelatedNotes] = useState<Note[]>([]);
  const [searchResults, setSearchResults] = useState<Note[]>([]);
  const [searchMode, setSearchMode] = useState<SearchMode>("semantic");
  const [exactSearchQuery, setExactSearchQuery] = useState("");
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
  const [editor, setEditor] = useState<Editor | null>(null);
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const [discardAction, setDiscardAction] = useState<{
    run: () => void;
  } | null>(null);

  // --- Loading states ---
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [isExportingNotes, setIsExportingNotes] = useState(false);
  const [isSearchingAI, setIsSearchingAI] = useState(false);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [isLoadingNote, setIsLoadingNote] = useState(false);
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
  const newNoteButtonRef = useRef<HTMLButtonElement>(null);
  const noteListRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const browseScrollRef = useRef(0);
  const editorOpenerRef = useRef<{
    element: HTMLElement | null;
    inBrowse: boolean;
  } | null>(null);
  const dialogOpenerRef = useRef<HTMLElement | null>(null);
  const noteRequestRef = useRef(0);
  const exportRequestRef = useRef<AbortController | null>(null);
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const isEditingNote = editor?.note != null;
  const isSavingNote = isCreatingNote || isUpdatingNote;
  const isDraftModified = Boolean(
    editor &&
    (title !== editor.initial.title ||
      content !== editor.initial.content ||
      tagInput !== editor.initial.tags ||
      selectedCollectionId !== editor.initial.collectionId ||
      newCollectionName),
  );

  useEffect(() => {
    if (!isDraftModified) return;
    const preventDiscard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener("beforeunload", preventDiscard);
    return () => window.removeEventListener("beforeunload", preventDiscard);
  }, [isDraftModified]);

  // --- Notification helper ---
  const showNotification = (
    message: string,
    type: NotificationState["type"] = "info",
  ) => {
    if (sessionSignal.aborted) return;
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
    sessionSignal.throwIfAborted();
    if (!cookie) throw new Error("Sign in to continue.");
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };
    // Cancel reads on sign-out and discard late write responses without aborting writes.
    const isRead = !options.method || options.method === "GET";
    const signal = isRead
      ? options.signal
        ? AbortSignal.any([sessionSignal, options.signal])
        : sessionSignal
      : options.signal;
    try {
      const data = await cookieWorkspaceRequest(
        cookie,
        sessionSignal,
        endpoint,
        {
          ...options,
          headers,
          signal,
        },
      );
      sessionSignal.throwIfAborted();
      return data as T;
    } catch (error) {
      if (!sessionSignal.aborted && needsCookieSignIn(error)) {
        clearWorkspace(cookie.user.id);
        setIsLogin(true);
        setAuthError(
          "Sign in to continue. Unsaved edits can be restored for the same account.",
        );
      }
      throw error;
    }
  };

  // --- Auth handlers ---
  const handleAuth = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (authPendingRef.current) return;
    if (!isLogin && !name.trim()) {
      setAuthError("Enter your name.");
      return;
    }

    authPendingRef.current = true;
    setIsAuthPending(true);
    setAuthError("");
    try {
      const endpoint = isLogin ? "/auth/login" : "/auth/register";
      const payload = isLogin ? { email, password } : { email, password, name };
      const current = await authenticateCookieSession(endpoint, payload);
      adoptCookieSession(current);
      cookieChannelRef.current?.postMessage("session-changed");
      setEmail("");
      setPassword("");
      setName("");
      showNotification(
        isLogin ? "Welcome back." : "Account created.",
        "success",
      );
    } catch (error) {
      if (
        error instanceof CookieAuthError &&
        [400, 401, 422, 429, 500].includes(error.status) &&
        !error.code
      ) {
        setAuthError(authResponseError(error.status, error.message, isLogin));
      } else {
        setAuthError(
          error instanceof CookieAuthError
            ? error.message
            : authResponseError(500, "", isLogin),
        );
      }
    } finally {
      authPendingRef.current = false;
      setIsAuthPending(false);
    }
  };

  const clearWorkspace = (preserveDraftFor?: string) => {
    requests.abort();
    setBulkImportAccess(null);
    noteRequestRef.current++;
    draftOwnerRef.current = preserveDraftFor ?? null;
    if (!preserveDraftFor) resetEditor();
    setShowMobileDetail(false);
    setIsLoadingNote(false);
    setIsLoadingRelated(false);
    browseScrollRef.current = 0;
    exportRequestRef.current?.abort();
    exportRequestRef.current = null;
    setIsExportingNotes(false);
    setSession({ cookie: null, requests: new AbortController() });
    setUser(null);
    if (notificationTimerRef.current)
      clearTimeout(notificationTimerRef.current);
    setNotification(null);
    setNotes([]);
    setIsLoadingNotes(false);
    setIsCreatingNote(false);
    setIsUpdatingNote(false);
    setDeleteTarget(null);
    setDiscardAction(null);
    setDeletingNoteId(null);
    setSelectedNote(null);
    setRelatedNotes([]);
    setSearchResults([]);
    setIsSearching(false);
    setIsSearchingAI(false);
    setSearchMode("semantic");
    setExactSearchQuery("");
    setQuery("");
    setCollections([]);
    setSelectedCollectionFilter(null);
  };

  const adoptCookieSession = (current: CookieSession) => {
    if (draftOwnerRef.current === current.user.id) {
      if (editor) setShowMobileDetail(true);
    } else {
      resetEditor();
    }
    draftOwnerRef.current = null;
    setAuthError("");
    setSession({
      cookie: current,
      requests: new AbortController(),
    });
    setUser(current.user);
  };

  const restoreSession = async (signal: AbortSignal) => {
    try {
      const current = await restoreCookieSession(signal);
      if (signal.aborted) return;
      adoptCookieSession(current);
      setCookieAction(null);
    } catch (error) {
      if (!signal.aborted) {
        setCookieAction(needsCookieSignIn(error) ? null : "restore-error");
      }
    }
  };

  const finishCookieLogout = async () => {
    const target = logoutTargetRef.current;
    if (!target) return;
    setCookieAction("signing-out");
    try {
      await logoutCookieSession(target);
    } catch (error) {
      if (!needsCookieSignIn(error)) {
        setCookieAction("logout-error");
        return;
      }
    }
    logoutTargetRef.current = null;
    setCookieAction(null);
  };

  const handleLogout = () => {
    clearWorkspace();
    if (cookie) {
      setIsLogin(true);
      logoutTargetRef.current = cookie;
      cookieChannelRef.current?.postMessage("session-changed");
      void finishCookieLogout();
    }
  };

  const onCookieChange = useEffectEvent(() => {
    if (!cookie) return;
    clearWorkspace(cookie.user.id);
    setIsLogin(true);
    setAuthError("The session changed in another tab. Sign in to continue.");
  });

  useEffect(() => {
    const request = new AbortController();
    void restoreSession(request.signal);
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(cookieSessionChannel);
      channel.onmessage = (event) => {
        if (event.data === "session-changed") onCookieChange();
      };
      cookieChannelRef.current = channel;
    }
    return () => {
      request.abort();
      cookieChannelRef.current?.close();
      cookieChannelRef.current = null;
    };
    // The startup probe runs only when the app mounts.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportNotes = async () => {
    if (!sessionKey || exportRequestRef.current) return;

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
    if (!sessionKey || sessionSignal.aborted) return;
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
      if (!sessionSignal.aborted) setIsLoadingNotes(false);
    }
  };

  const fetchCollections = async () => {
    if (!sessionKey) return;
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
      const data = await apiRequest<ResourceResponse<Note, "note">>("/notes", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSelectedNote(unwrapResource<Note, "note">(data, "note"));
      setRelatedNotes([]);
      resetEditor();
      openWorkspace();
      await fetchNotes();
      showNotification("Note created.", "success");
    } catch (err) {
      showNotification(errorMessage(err), "error");
    } finally {
      if (!sessionSignal.aborted) setIsCreatingNote(false);
    }
  };

  const updateNote = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editor?.note || !title.trim() || !content.trim()) {
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
        `/notes/${editor.note._id}`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
      );
      const updated = unwrapResource<Note, "note">(data, "note");
      if (selectedNote?._id !== updated._id) setRelatedNotes([]);
      setSelectedNote(updated);
      setSearchResults((results) =>
        results.map((note) =>
          note._id === updated._id ? { ...note, ...updated } : note,
        ),
      );
      resetEditor();
      openWorkspace();
      await fetchNotes();
      showNotification("Note updated.", "success");
    } catch (err) {
      showNotification(errorMessage(err), "error");
    } finally {
      if (!sessionSignal.aborted) setIsUpdatingNote(false);
    }
  };

  const deleteNote = async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget._id;
    setDeletingNoteId(targetId);
    try {
      await apiRequest(`/notes/${targetId}`, { method: "DELETE" });
      if (selectedNote?._id === targetId) {
        noteRequestRef.current++;
        setIsLoadingNote(false);
        setIsLoadingRelated(false);
        setSelectedNote(null);
        setRelatedNotes([]);
        if (!editor) showBrowse();
      }
      setSearchResults((results) =>
        results.filter((note) => note._id !== targetId),
      );
      setDeleteTarget(null);
      await fetchNotes();
      if (sessionSignal.aborted) return;
      restoreFocus(dialogOpenerRef.current);
      showNotification("Note deleted.", "success");
    } catch (err) {
      showNotification(errorMessage(err), "error");
    } finally {
      if (!sessionSignal.aborted) setDeletingNoteId(null);
    }
  };

  const viewNote = async (id: string) => {
    const request = ++noteRequestRef.current;
    openWorkspace();
    setIsLoadingNote(true);
    setIsLoadingRelated(true);
    try {
      const data = await apiRequest<
        ResourceResponse<NoteDetail, "note"> & { relatedNotes?: Note[] }
      >(`/notes/${id}`);
      if (request !== noteRequestRef.current) return;
      const note = unwrapResource<NoteDetail, "note">(data, "note");
      setSelectedNote(note);
      setRelatedNotes(data.relatedNotes || note.relatedNotes || []);
    } catch {
      if (request === noteRequestRef.current) {
        showNotification("Failed to load note.", "error");
      }
    } finally {
      if (request === noteRequestRef.current) {
        setIsLoadingNote(false);
        setIsLoadingRelated(false);
      }
    }
  };

  // --- Search ---
  const handleSearch = async (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    const submittedQuery = query.trim();
    if (!submittedQuery) {
      showNotification("Enter a search query.", "error");
      return;
    }
    setIsSearchingAI(true);
    try {
      const data = await apiRequest<{
        results?: Note[];
        data?: Note[];
      }>("/notes/search", {
        method: "POST",
        signal: sessionSignal,
        body: JSON.stringify({ query: submittedQuery, mode: searchMode }),
      });
      const results = data.results || data.data || [];
      setSearchResults(results);
      setExactSearchQuery(searchMode === "exact" ? submittedQuery : "");
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
      if (!sessionSignal.aborted) setIsSearchingAI(false);
    }
  };

  const clearSearch = () => {
    setQuery("");
    setSearchResults([]);
    setIsSearching(false);
  };

  // --- Workspace navigation ---
  const openWorkspace = (focusTitle = false) => {
    const list = noteListRef.current;
    if (list?.getClientRects().length) browseScrollRef.current = list.scrollTop;
    setShowMobileDetail(true);
    window.requestAnimationFrame(() => {
      if (detailRef.current) detailRef.current.scrollTop = 0;
      const target = focusTitle
        ? document.getElementById("note-title")
        : detailRef.current;
      target?.focus({ preventScroll: true });
    });
  };

  const showBrowse = (focusSearch = false) => {
    const isMobile = window.matchMedia("(max-width: 800px)").matches;
    if (isMobile || !focusSearch) setShowMobileDetail(false);
    window.requestAnimationFrame(() => {
      const list = noteListRef.current;
      if (isMobile && showMobileDetail && list)
        list.scrollTop = browseScrollRef.current;
      const target = focusSearch
        ? searchInputRef.current
        : (list?.querySelector<HTMLElement>('[aria-current="true"]') ??
          newNoteButtonRef.current);
      target?.focus({ preventScroll: true });
    });
  };

  const restoreFocus = (opener: HTMLElement | null, detailAction?: string) => {
    window.requestAnimationFrame(() => {
      const detailControl = detailAction
        ? detailRef.current?.querySelector<HTMLElement>(detailAction)
        : null;
      const target = [
        opener,
        detailControl,
        newNoteButtonRef.current,
        detailRef.current,
      ].find(
        (element) => element?.isConnected && element.getClientRects().length,
      );
      target?.focus({ preventScroll: true });
    });
  };

  const resetEditor = () => {
    setEditor(null);
    setTitle("");
    setContent("");
    setTagInput("");
    setSelectedCollectionId("");
    setNewCollectionName("");
  };

  const leaveEditor = (run: () => void) => {
    if (isSavingNote || deleteTarget || discardAction) return;
    const discard = () => {
      resetEditor();
      run();
    };
    if (isDraftModified) {
      dialogOpenerRef.current = document.activeElement as HTMLElement | null;
      setDiscardAction({ run: discard });
    } else {
      discard();
    }
  };

  const beginEditor = (note?: Note) => {
    const opener = document.activeElement as HTMLElement | null;
    const inBrowse = Boolean(opener?.closest(".sidebar"));
    leaveEditor(() => {
      const version = ++noteRequestRef.current;
      setIsLoadingNote(false);
      setIsLoadingRelated(false);
      const initial = draftFields(note);
      setEditor({ note: note ?? null, initial, version });
      editorOpenerRef.current = { element: opener, inBrowse };
      setTitle(initial.title);
      setContent(initial.content);
      setTagInput(initial.tags);
      setSelectedCollectionId(initial.collectionId);
      openWorkspace(true);
    });
  };

  const cancelEditor = () => {
    const opener = editorOpenerRef.current;
    leaveEditor(() => {
      if (opener?.inBrowse || !selectedNote) showBrowse();
      restoreFocus(
        opener?.element ?? null,
        opener?.inBrowse
          ? undefined
          : selectedNote
            ? ".note-header-actions .secondary-btn"
            : ".main-empty .primary-btn",
      );
    });
  };

  const selectNote = (id: string) => {
    leaveEditor(() => void viewNote(id));
  };

  const requestDelete = (note: Note) => {
    if (isSavingNote || discardAction || deleteTarget) return;
    const opener = document.activeElement as HTMLElement | null;
    const openDialog = () => {
      dialogOpenerRef.current = opener;
      setDeleteTarget(note);
    };
    if (editor?.note?._id === note._id) leaveEditor(openDialog);
    else openDialog();
  };

  const cancelDelete = () => {
    setDeleteTarget(null);
    restoreFocus(dialogOpenerRef.current);
  };

  const keepDraft = () => {
    setDiscardAction(null);
    restoreFocus(dialogOpenerRef.current);
  };

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        !sessionKey ||
        deleteTarget ||
        discardAction ||
        document.querySelector(".plan-dialog[open]")
      )
        return;
      const mod = e.ctrlKey || e.metaKey;
      const isTyping = ["input", "textarea"].includes(
        document.activeElement?.tagName?.toLowerCase() ?? "",
      );
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        showBrowse(true);
        return;
      }
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        beginEditor();
        return;
      }
      if (
        mod &&
        e.key === "Enter" &&
        document.activeElement?.closest(".create-panel")
      ) {
        e.preventDefault();
        if (!isSavingNote) {
          detailRef.current
            ?.querySelector<HTMLFormElement>(".create-form")
            ?.requestSubmit();
        }
        return;
      }
      const deleteShortcutTarget = editor?.note ?? selectedNote;
      if (mod && e.key === "Delete" && deleteShortcutTarget && !isTyping) {
        e.preventDefault();
        requestDelete(deleteShortcutTarget);
        return;
      }
      if (e.key === "Escape") {
        if (
          editor &&
          (showMobileDetail || !window.matchMedia("(max-width: 800px)").matches)
        )
          cancelEditor();
        else if (isSearching) clearSearch();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });

  // --- Effects ---
  useEffect(() => {
    if (sessionKey) {
      // oxlint-disable-next-line react/set-state-in-effect
      fetchNotes();
      fetchCollections();
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, selectedTagFilter, selectedCollectionFilter]);

  useEffect(() => {
    if (!sessionKey) return;
    const request = new AbortController();
    void apiRequest<{ entitlements?: { bulkMarkdownImport?: boolean } }>(
      "/subscription",
      { signal: request.signal },
    ).then(
      (subscription) => {
        if (request.signal.aborted || sessionSignal.aborted) return;
        setBulkImportAccess((current) =>
          current?.sessionKey === sessionKey
            ? current
            : {
                sessionKey,
                allowed:
                  subscription?.entitlements?.bulkMarkdownImport === true,
              },
        );
      },
      () => {},
    );
    return () => request.abort();
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  // --- Auth screen ---
  if (cookieAction) {
    const signingOut =
      cookieAction === "signing-out" || cookieAction === "logout-error";
    const failed =
      cookieAction === "restore-error" || cookieAction === "logout-error";
    return (
      <main className="auth-page">
        <div className="auth-box">
          <h1>DevMind</h1>
          {failed ? (
            <div className="auth-form">
              <p role="alert">
                {signingOut
                  ? "Could not confirm sign-out."
                  : "Could not restore your session."}
              </p>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  if (signingOut) void finishCookieLogout();
                  else {
                    setCookieAction("restoring");
                    void restoreSession(new AbortController().signal);
                  }
                }}
              >
                Retry
              </button>
            </div>
          ) : (
            <p role="status">
              {signingOut ? "Signing out…" : "Restoring session…"}
            </p>
          )}
        </div>
      </main>
    );
  }
  if (!sessionKey) {
    return (
      <AuthPage
        isLogin={isLogin}
        onSwitchMode={() => {
          if (authPendingRef.current) return;
          setAuthError("");
          setIsLogin((value) => !value);
        }}
        error={authError}
        isPending={isAuthPending}
        onEdit={() => setAuthError("")}
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
        accountControl={
          <>
            <PlanPanel
              key={sessionKey}
              apiRequest={apiRequest}
              checkoutEnabled={mockCheckoutEnabled}
              onBulkImportAccessChange={(allowed) => {
                if (!sessionSignal.aborted)
                  setBulkImportAccess({ sessionKey, allowed });
              }}
            />
            {bulkImportAccess?.sessionKey === sessionKey &&
              bulkImportAccess.allowed && (
                <BulkImportPanel
                  key={sessionKey + "-import"}
                  apiRequest={apiRequest}
                  onSaved={() => void fetchNotes()}
                />
              )}
          </>
        }
        onExportNotes={exportNotes}
        isExportingNotes={isExportingNotes}
        notesCount={notes.length}
        userLabel={user?.name || user?.email || "Account"}
        theme={theme}
        onToggleTheme={() =>
          setTheme((t) => (t === "light" ? "dark" : "light"))
        }
        onLogout={() => leaveEditor(handleLogout)}
      />

      <main
        className={`workspace ${showMobileDetail ? "workspace-show-detail" : ""}`}
        aria-label="Notes workspace"
      >
        <Sidebar
          notes={displayNotes}
          exactSearchQuery={isSearching ? exactSearchQuery : ""}
          selectedNoteId={editor?.note?._id ?? selectedNote?._id}
          isLoading={isLoadingNotes && displayNotes.length === 0}
          isSearching={isSearching}
          searchMode={searchMode}
          noteListRef={noteListRef}
          newNoteButtonRef={newNoteButtonRef}
          onNewNote={() => beginEditor()}
          onResumeDraft={
            editor && !showMobileDetail ? () => openWorkspace(true) : undefined
          }
          onViewNote={selectNote}
          onEditNote={beginEditor}
          onDeleteNote={requestDelete}
          collections={collections}
          selectedCollectionFilter={selectedCollectionFilter}
          setSelectedCollectionFilter={setSelectedCollectionFilter}
          search={
            <SearchBar
              mode={searchMode}
              setMode={(mode) => {
                setSearchMode(mode);
                setSearchResults([]);
                setIsSearching(false);
              }}
              query={query}
              setQuery={setQuery}
              onSearch={handleSearch}
              onClearSearch={clearSearch}
              isSearchingAI={isSearchingAI}
              searchInputRef={searchInputRef}
            />
          }
        />

        <section
          className="main-pane"
          ref={detailRef}
          tabIndex={-1}
          aria-label="Note detail"
        >
          {!editor && (
            <button
              type="button"
              className="secondary-btn workspace-back"
              onClick={() => showBrowse()}
            >
              Back to notes
            </button>
          )}
          {editor ? (
            <CreatePanel
              key={`${sessionKey}:${editor.version}`}
              isEditing={isEditingNote}
              title={title}
              setTitle={setTitle}
              content={content}
              setContent={setContent}
              tagInput={tagInput}
              setTagInput={setTagInput}
              onSubmit={isEditingNote ? updateNote : createNote}
              onCancel={cancelEditor}
              isSaving={isSavingNote}
              submitLabel={isEditingNote ? "Save changes" : "Save note"}
              collections={collections}
              selectedCollectionId={selectedCollectionId}
              setSelectedCollectionId={setSelectedCollectionId}
              newCollectionName={newCollectionName}
              setNewCollectionName={setNewCollectionName}
              onSuggest={(draft, signal) =>
                apiRequest("/notes/suggestions", {
                  method: "POST",
                  body: JSON.stringify({
                    title: draft.title.trim().slice(0, 200),
                    content: draft.content.trim().slice(0, 2400),
                  }),
                  signal: AbortSignal.any([sessionSignal, signal]),
                })
              }
              onCreateCollection={createCollection}
            />
          ) : (
            <NoteView
              selectedNote={selectedNote}
              relatedNotes={relatedNotes}
              isLoadingNote={isLoadingNote}
              isLoadingRelated={isLoadingRelated}
              onViewNote={selectNote}
              onCreateNote={() => beginEditor()}
              hasNotes={notes.length > 0 || Boolean(selectedCollectionFilter)}
              onEditNote={beginEditor}
              onDeleteNote={requestDelete}
              deletingNoteId={deletingNoteId}
            />
          )}
        </section>
      </main>

      {discardAction && (
        <ConfirmModal
          title="Discard unsaved changes?"
          description="Your changes will be lost."
          cancelLabel="Keep editing"
          confirmLabel="Discard changes"
          onConfirm={() => {
            setDiscardAction(null);
            discardAction.run();
          }}
          onCancel={keepDraft}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          title={`Delete “${deleteTarget.title}”?`}
          description="This action cannot be undone."
          confirmLabel={
            deletingNoteId === deleteTarget._id ? "Deleting…" : "Delete note"
          }
          onConfirm={deleteNote}
          onCancel={cancelDelete}
          isBusy={deletingNoteId === deleteTarget._id}
        />
      )}
    </div>
  );
}

export default App;
