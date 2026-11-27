import SignInMethods from "./features/auth/SignInMethods";
import { useFavorites } from "./features/favorites/useFavorites";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";
import type { Collection, Note, SearchMode } from "./types";
import "./App.css";

// Components
import AuthPage from "./components/AuthPage";
import WorkspaceShell, {
  FocusControl,
  mobileWorkspace,
} from "./features/workspace/WorkspaceShell";
import NavigationSidebar, {
  favoritesFilter,
  uncategorized,
} from "./features/workspace/NavigationSidebar";
import AccountMenu from "./features/workspace/AccountMenu";
import NoteDetails from "./features/workspace/NoteDetails";
import { fitsNoteRequest, readMarkdownFile } from "./markdownFile";
import "./features/workspace/workspace.css";
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
  registrationRequiresEmail,
  requestRegistrationEmail,
  followOAuthAuthorization,
  oauthSignInAvailable,
  startOAuthSignIn,
  oauthProviders,
  oauthProviderNames,
  type OAuthProvider,
  CookieAuthError,
  cookieSessionChannel,
  cookieWorkspaceRequest,
  logoutCookieSession,
  needsCookieSignIn,
  restoreCookieSession,
} from "./features/auth/cookie-session";
import type { CookieSession } from "./features/auth/cookie-session";

const notesFreshForMs = 30_000;
const mockCheckoutEnabled = import.meta.env.VITE_ENABLE_MOCK_BILLING === "true";
type User = { name?: string; email?: string };
type NotificationState = {
  message: string;
  type: "info" | "success" | "error";
};
type NoteDetail = Note & { relatedNotes?: Note[] };
type NotePage = { notes: Note[]; nextCursor: string | null };
type BrowsePage = NotePage & { fetchedAt: number };

function notePagePath(collectionId = "", cursor?: string) {
  const params = new URLSearchParams({ page: "true" });
  if (collectionId) params.set("collectionId", collectionId);
  if (cursor) params.set("cursor", cursor);
  return `/notes?${params}`;
}

function readNotePage(data: NotePage | Note[]): NotePage {
  // Allow the prior response shape while the frontend and API deploy separately.
  if (Array.isArray(data)) return { notes: data, nextCursor: null };
  if (
    !Array.isArray(data?.notes) ||
    (data.nextCursor !== null &&
      (!data.nextCursor || typeof data.nextCursor !== "string"))
  ) {
    throw new Error("Unexpected notes response");
  }
  return data;
}

function browseScope(filter: string | null, all: BrowsePage | undefined) {
  return filter && filter !== uncategorized && all?.nextCursor !== null
    ? filter
    : "";
}
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

type OAuthReturn = { provider: OAuthProvider; result: string };

function oauthReturnError({ provider, result }: OAuthReturn) {
  const name = oauthProviderNames[provider];
  switch (result) {
    case "cancelled":
      return `${name} sign-in was cancelled. You can try again.`;
    case "invalid":
      return `${name} could not verify this sign-in. Start again.`;
    case "unavailable":
      return `${name} sign-in is temporarily unavailable. Try again or use your password.`;
    default:
      return "";
  }
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
  const [oauthEnabled, setOAuthEnabled] = useState({
    google: false,
    github: false,
  });
  const [oauthPending, setOAuthPending] = useState<OAuthProvider | null>(null);
  const [oauthReturn, setOAuthReturn] = useState<OAuthReturn | null>(() => {
    const params = new URL(window.location.href).searchParams;
    for (const provider of oauthProviders) {
      const result = params.get(provider);
      if (result !== null) return { provider, result };
    }
    return null;
  });
  const [oauthFeedback, setOAuthFeedback] = useState("");
  const [showSignInMethods, setShowSignInMethods] = useState(false);
  const oauthFinish = useRef<Promise<CookieSession> | null>(null);
  const oauthError =
    oauthFeedback || (oauthReturn ? oauthReturnError(oauthReturn) : "");
  const connectCallback =
    oauthReturn?.result === "connect" ? oauthReturn.provider : null;

  const [authError, setAuthError] = useState("");
  const [isAuthPending, setIsAuthPending] = useState(false);
  const authPendingRef = useRef(false);
  const [bulkImportAccess, setBulkImportAccess] = useState<{
    sessionKey: string;
    allowed: boolean;
    plan?: "free" | "pro";
  } | null>(null);

  // --- Data ---
  const [favoritesView, setFavoritesView] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [relatedNotes, setRelatedNotes] = useState<Note[]>([]);
  const [searchResults, setSearchResults] = useState<Note[]>([]);
  const [searchMode, setSearchMode] = useState<SearchMode>("semantic");
  const [exactSearchQuery, setExactSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // --- Collections & Tags ---
  const [collections, setCollections] = useState<Collection[]>([]);
  const importFileRef = useRef<HTMLInputElement>(null);
  const importingFile = useRef(false);
  const openImportedDraft =
    useRef<(draft: { title: string; content: string }) => void>(null);
  const notesRequest = useRef<AbortController | null>(null);
  const notesScope = useRef("");
  const browseSelection = useRef<string | null>(null);
  const [notePages, setNotePages] = useState<Record<string, BrowsePage>>({});
  const [selectedCollectionFilter, setSelectedCollectionFilter] = useState<
    string | null
  >(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [newCollectionName, setNewCollectionName] = useState("");

  // --- UI state ---
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
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
  const [registrationToken, setRegistrationToken] = useState(() =>
    new URLSearchParams(window.location.hash.slice(1)).get("verify-email"),
  );
  const [isLogin, setIsLogin] = useState(registrationToken === null);
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(
    registrationToken !== null,
  );
  const [verificationRequested, setVerificationRequested] = useState(false);
  const registrationStep = isLogin
    ? undefined
    : registrationToken !== null
      ? "finish"
      : emailVerificationRequired
        ? "email"
        : undefined;
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [query, setQuery] = useState("");
  const [tagInput, setTagInput] = useState("");

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

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("devmind-theme", theme);
    } catch {
      /* Theme still applies for this session. */
    }
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

  const favorites = useFavorites(sessionKey, sessionSignal, apiRequest);

  useEffect(() => {
    const controller = new AbortController();
    void registrationRequiresEmail(controller.signal).then(
      (required) => {
        if (!controller.signal.aborted && required)
          setEmailVerificationRequired(true);
      },
      () => {},
    );
    for (const provider of oauthProviders) {
      void oauthSignInAvailable(provider, controller.signal).then(
        (enabled) => {
          if (!controller.signal.aborted)
            setOAuthEnabled((current) => ({ ...current, [provider]: enabled }));
        },
        () => {},
      );
    }
    const url = new URL(window.location.href);
    const oauthCallback = oauthProviders.some((provider) =>
      url.searchParams.has(provider),
    );
    const emailCallback = new URLSearchParams(url.hash.slice(1)).has(
      "verify-email",
    );
    if (oauthCallback || emailCallback) {
      for (const provider of oauthProviders) url.searchParams.delete(provider);
      if (emailCallback) url.hash = "";
      window.history.replaceState(
        window.history.state,
        "",
        url.pathname + url.search + url.hash,
      );
    }
    return () => controller.abort();
  }, []);

  const continueWithOAuth = async (provider: OAuthProvider) => {
    if (authPendingRef.current) return;
    authPendingRef.current = true;
    setIsAuthPending(true);
    setOAuthPending(provider);
    setOAuthReturn(null);
    setOAuthFeedback("");
    setAuthError("");
    try {
      followOAuthAuthorization(provider, await startOAuthSignIn(provider));
    } catch (error) {
      setOAuthFeedback(
        error instanceof CookieAuthError
          ? error.message
          : `${oauthProviderNames[provider]} sign-in could not be started. Try again.`,
      );
      authPendingRef.current = false;
      setIsAuthPending(false);
      setOAuthPending(null);
    }
  };

  // --- Auth handlers ---
  const handleAuth = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (authPendingRef.current) return;
    if (!isLogin && registrationStep !== "email" && !name.trim()) {
      setAuthError("Enter your name.");
      return;
    }

    authPendingRef.current = true;
    setIsAuthPending(true);
    setOAuthReturn(null);
    setOAuthFeedback("");
    setAuthError("");
    try {
      if (registrationStep === "email") {
        await requestRegistrationEmail(email);
        setVerificationRequested(true);
        return;
      }
      const endpoint = isLogin ? "/auth/login" : "/auth/register";
      const payload = isLogin
        ? { email, password }
        : registrationStep === "finish"
          ? { name, password, verificationToken: registrationToken }
          : { email, password, name };
      const current = await authenticateCookieSession(endpoint, payload);
      adoptCookieSession(current);
      cookieChannelRef.current?.postMessage("session-changed");
      setEmail("");
      setPassword("");
      setName("");
      setRegistrationToken(null);
      setVerificationRequested(false);
      setIsLogin(true);
      showNotification(
        isLogin ? "Welcome back." : "Account created.",
        "success",
      );
    } catch (error) {
      if (
        error instanceof CookieAuthError &&
        error.code === "REGISTRATION_EMAIL_VERIFICATION_REQUIRED"
      ) {
        setEmailVerificationRequired(true);
        setRegistrationToken(null);
        setVerificationRequested(false);
        setPassword("");
      }
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
    setShowSignInMethods(false);
    setOAuthReturn(null);
    setOAuthFeedback("");
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
    setNotePages({});
    setFavoritesView(false);
    importingFile.current = false;
    notesRequest.current?.abort();
    notesRequest.current = null;
    notesScope.current = "";
    browseSelection.current = null;
    if (notificationTimerRef.current)
      clearTimeout(notificationTimerRef.current);
    setNotification(null);
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
    if (oauthReturn?.result === "sign-in" && !oauthFeedback) {
      const { provider } = oauthReturn;
      oauthFinish.current ??= authenticateCookieSession(
        `/auth/${provider}/finish-sign-in`,
        {},
      );
      try {
        const current = await oauthFinish.current;
        if (signal.aborted) return;
        adoptCookieSession(current);
        cookieChannelRef.current?.postMessage("session-changed");
        setOAuthReturn(null);
        setCookieAction(null);
        return;
      } catch (error) {
        if (signal.aborted) return;
        setOAuthFeedback(
          error instanceof CookieAuthError
            ? error.message
            : `Could not complete ${oauthProviderNames[provider]} sign-in. Start again.`,
        );
        setOAuthReturn(null);
      }
    }
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
      const allNotes = new Map<string, Note>();
      const cursors = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = readNotePage(
          await apiRequest<NotePage | Note[]>(notePagePath("", cursor), {
            signal: request.signal,
          }),
        );
        if (request.signal.aborted) return;
        for (const note of page.notes) allNotes.set(note._id, note);
        cursor = page.nextCursor ?? undefined;
        if (cursor) {
          if (cursors.has(cursor)) throw new Error("Repeated note cursor");
          cursors.add(cursor);
        }
      } while (cursor);
      if (allNotes.size === 0) {
        showNotification("No notes to export.", "info");
        return;
      }

      const markdown = [...allNotes.values()]
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
  const fetchNotes = async (scope = "", cursor?: string) => {
    if (!sessionKey || sessionSignal.aborted) return;
    notesRequest.current?.abort();
    const request = new AbortController();
    notesRequest.current = request;
    setIsLoadingNotes(true);
    try {
      const page = readNotePage(
        await apiRequest<NotePage | Note[]>(notePagePath(scope, cursor), {
          signal: request.signal,
        }),
      );
      if (sessionSignal.aborted || request.signal.aborted) return;
      const fetchedAt = Date.now();
      setNotePages((pages) => {
        const previous = pages[scope];
        if (!cursor) return { ...pages, [scope]: { ...page, fetchedAt } };
        if (previous?.nextCursor !== cursor) return pages;
        const notes = new Map(previous.notes.map((note) => [note._id, note]));
        for (const note of page.notes) notes.set(note._id, note);
        return {
          ...pages,
          [scope]: {
            ...previous,
            notes: [...notes.values()],
            nextCursor: page.nextCursor,
          },
        };
      });
    } catch {
      if (!sessionSignal.aborted && !request.signal.aborted)
        showNotification("Failed to load notes.", "error");
    } finally {
      if (notesRequest.current === request) {
        notesRequest.current = null;
        setIsLoadingNotes(false);
      }
    }
  };

  const refreshNotes = () => {
    const scope = browseScope(browseSelection.current, undefined);
    notesScope.current = scope;
    setNotePages({});
    return fetchNotes(scope);
  };

  const fetchCollections = async () => {
    if (!sessionKey) return;
    try {
      const data = await apiRequest<Collection[] | { data?: Collection[] }>(
        "/collections",
      );
      if (sessionSignal.aborted) return;
      const items = Array.isArray(data) ? data : data.data || [];
      setCollections((current) => [
        ...items,
        ...current.filter(({ _id }) => !items.some((item) => item._id === _id)),
      ]);
    } catch {
      // ignore
    }
  };

  const createCollection = async (name: string) => {
    const data = await apiRequest<ResourceResponse<Collection, "collection">>(
      "/collections",
      { method: "POST", body: JSON.stringify({ name: name.trim() }) },
    );
    const collection = unwrapResource<Collection, "collection">(
      data,
      "collection",
    );
    if (
      typeof collection?._id !== "string" ||
      typeof collection.name !== "string"
    ) {
      throw new Error(
        "Could not confirm collection creation. Refresh your collections before retrying.",
      );
    }
    setCollections((previous) =>
      previous.some(({ _id }) => _id === collection._id)
        ? previous
        : [...previous, collection],
    );
    showNotification("Collection created.", "success");
    return collection;
  };

  const createEditorCollection = async (name: string) => {
    if (!name.trim()) return null;
    try {
      return await createCollection(name);
    } catch (error) {
      showNotification(errorMessage(error), "error");
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
      await refreshNotes();
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
      favorites.updateNote(updated);
      setSearchResults((results) =>
        results.map((note) =>
          note._id === updated._id ? { ...note, ...updated } : note,
        ),
      );
      resetEditor();
      openWorkspace();
      await refreshNotes();
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
      favorites.remove(targetId);
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
      await refreshNotes();
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
    const isMobile = window.matchMedia(mobileWorkspace).matches;
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

  const beginEditor = (
    note?: Note,
    imported?: { title: string; content: string },
  ) => {
    const opener = document.activeElement as HTMLElement | null;
    const inBrowse = Boolean(opener?.closest(".sidebar"));
    leaveEditor(() => {
      const version = ++noteRequestRef.current;
      setIsLoadingNote(false);
      setIsLoadingRelated(false);
      const initial = draftFields(note);
      setEditor({ note: note ?? null, initial, version });
      editorOpenerRef.current = { element: opener, inBrowse };
      setTitle(imported?.title ?? initial.title);
      setContent(imported?.content ?? initial.content);
      setTagInput(initial.tags);
      setSelectedCollectionId(initial.collectionId);
      openWorkspace(true);
    });
  };

  useLayoutEffect(() => {
    openImportedDraft.current = (draft) => beginEditor(undefined, draft);
  });

  const importWorkspaceDraft = async (file: File) => {
    if (importingFile.current) return;
    importingFile.current = true;
    try {
      const draft = await readMarkdownFile(file);
      if (sessionSignal.aborted) return;
      if (
        !fitsNoteRequest(
          JSON.stringify({ ...draft, content: draft.content.trim(), tags: [] }),
        )
      ) {
        throw new Error("This file exceeds the 1 MiB note request limit.");
      }
      openImportedDraft.current?.(draft);
    } catch (error) {
      if (!sessionSignal.aborted)
        showNotification(errorMessage(error), "error");
    } finally {
      if (!sessionSignal.aborted) importingFile.current = false;
    }
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
        e.defaultPrevented ||
        document.querySelector(".plan-dialog[open], [data-workspace-overlay]")
      )
        return;
      const mod = e.ctrlKey || e.metaKey;
      const isTyping = ["input", "textarea"].includes(
        document.activeElement?.tagName?.toLowerCase() ?? "",
      );
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
          (showMobileDetail || !window.matchMedia(mobileWorkspace).matches)
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
  }, [sessionKey]);

  useEffect(() => {
    if (!sessionKey) return;
    const request = new AbortController();
    void apiRequest<{
      plan?: "free" | "pro";
      entitlements?: { bulkMarkdownImport?: boolean };
    }>("/subscription", { signal: request.signal }).then(
      (subscription) => {
        if (request.signal.aborted || sessionSignal.aborted) return;
        setBulkImportAccess((current) =>
          current?.sessionKey === sessionKey
            ? current
            : {
                sessionKey,
                plan: subscription?.plan,
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
        registrationStep={registrationStep}
        verificationRequested={verificationRequested}
        onSwitchMode={() => {
          if (authPendingRef.current) return;
          setAuthError("");
          setRegistrationToken(null);
          setVerificationRequested(false);
          if (registrationStep) setPassword("");
          setIsLogin((value) => !value);
        }}
        error={
          authError ||
          oauthError ||
          (connectCallback
            ? `Sign in to the original DevMind account before connecting ${oauthProviderNames[connectCallback]} again.`
            : "")
        }
        oauthEnabled={oauthEnabled}
        oauthPending={oauthPending}
        onOAuthSignIn={(provider) => void continueWithOAuth(provider)}
        isPending={isAuthPending}
        onEdit={() => {
          setAuthError("");
          setOAuthFeedback("");
          setOAuthReturn(null);
        }}
        email={email}
        setEmail={(value) => {
          setEmail(value);
          setVerificationRequested(false);
        }}
        password={password}
        setPassword={setPassword}
        name={name}
        setName={setName}
        onSubmit={handleAuth}
      />
    );
  }

  // --- Main app ---
  const allPage = notePages[""];
  const scope = browseScope(selectedCollectionFilter, allPage);
  const activePage = notePages[scope];
  const notes = activePage?.notes ?? [];
  const collectionNotes = selectedCollectionFilter
    ? notes.filter((note) =>
        selectedCollectionFilter === uncategorized
          ? !note.collections?.length && !note.collection
          : note.collections?.some(
              ({ _id }) => _id === selectedCollectionFilter,
            ),
      )
    : notes;
  const displayNotes = isSearching
    ? searchResults
    : favoritesView
      ? favorites.favorites
      : collectionNotes;
  const browseFilter = (id: string | null) => {
    setIsSearching(false);
    setFavoritesView(id === favoritesFilter);
    if (id !== favoritesFilter) {
      setSelectedCollectionFilter(id);
      browseSelection.current = id;
      const nextScope = browseScope(id, allPage);
      const existing = notePages[nextScope];
      const scopeChanged = nextScope !== notesScope.current;
      notesScope.current = nextScope;
      if (
        (scopeChanged || !notesRequest.current) &&
        (!existing || Date.now() - existing.fetchedAt >= notesFreshForMs)
      ) {
        void fetchNotes(nextScope);
      }
    }
    showBrowse();
  };
  const plan =
    bulkImportAccess?.sessionKey === sessionKey
      ? bulkImportAccess.plan
      : undefined;
  const counts =
    !selectedCollectionFilter && allPage?.nextCursor === null
      ? new Map<string, number>()
      : null;
  if (counts && allPage) {
    for (const note of allPage.notes) {
      const ids = note.collections?.map(({ _id }) => _id) ?? [];
      if (!ids.length && !note.collection) ids.push(uncategorized);
      for (const id of new Set(ids)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  const account = (
    <AccountMenu
      name={user?.name || user?.email || "Account"}
      email={user?.email}
      plan={plan}
      theme={theme}
      onTheme={setTheme}
      onExport={exportNotes}
      exporting={isExportingNotes}
      onLogout={() => leaveEditor(handleLogout)}
      onSignInMethods={() => setShowSignInMethods(true)}
      planControl={
        <PlanPanel
          apiRequest={apiRequest}
          checkoutEnabled={mockCheckoutEnabled}
          triggerLabel={
            plan === "pro"
              ? "Manage plan"
              : plan === "free"
                ? "Upgrade plan"
                : "Plan & usage"
          }
          onBulkImportAccessChange={(allowed, nextPlan) => {
            if (!sessionSignal.aborted)
              setBulkImportAccess({ sessionKey, allowed, plan: nextPlan });
          }}
        />
      }
    />
  );

  return (
    <div className={`app-shell ${theme === "dark" ? "theme-dark" : ""}`}>
      <Notification
        notification={notification}
        onDismiss={() => setNotification(null)}
      />
      {(showSignInMethods || connectCallback || oauthError) && (
        <SignInMethods
          key={`sign-in-methods:${sessionKey}`}
          apiRequest={apiRequest}
          signal={sessionSignal}
          enabled={oauthEnabled}
          callback={connectCallback}
          feedback={oauthError}
          onConnect={leaveEditor}
          onClose={() => {
            setShowSignInMethods(false);
            setOAuthReturn(null);
            setOAuthFeedback("");
          }}
        />
      )}
      {favorites.failure && (
        <div role="alert" className="favorites-mutation-feedback">
          <span>{favorites.failure}</span>
          <button
            type="button"
            className="secondary-btn"
            onClick={favorites.dismissFailure}
          >
            Dismiss
          </button>
        </div>
      )}
      <input
        ref={importFileRef}
        type="file"
        accept=".md"
        hidden
        aria-label="Import Markdown file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importWorkspaceDraft(file);
        }}
      />
      <WorkspaceShell
        key={sessionKey}
        showDetail={showMobileDetail}
        showBrowse={showBrowse}
        canFocus={Boolean(editor || selectedNote)}
        details={
          !editor &&
          selectedNote && (
            <NoteDetails
              note={selectedNote}
              related={relatedNotes}
              loading={isLoadingRelated}
              onView={selectNote}
            />
          )
        }
        navigation={
          <NavigationSidebar
            collections={collections}
            counts={counts}
            active={
              favoritesView
                ? favoritesFilter
                : isSearching
                  ? null
                  : selectedCollectionFilter
            }
            onFilter={browseFilter}
            onCreate={createCollection}
            account={account}
            onImport={() => importFileRef.current?.click()}
            bulkImport={
              bulkImportAccess?.sessionKey === sessionKey &&
              bulkImportAccess.allowed ? (
                <BulkImportPanel
                  apiRequest={apiRequest}
                  onSaved={() => void refreshNotes()}
                />
              ) : null
            }
          />
        }
        browse={
          <Sidebar
            notes={displayNotes}
            favorites={favorites}
            favoritesView={favoritesView}
            recentFavorites={
              !favoritesView && !isSearching && !selectedCollectionFilter
                ? favorites.favorites
                : undefined
            }
            favoritesError={favorites.loadError}
            favoritesLoading={favorites.loading}
            onRetryFavorites={favorites.retryLoad}
            onShowFavorites={() => browseFilter(favoritesFilter)}
            onBrowseNotes={() => browseFilter(null)}
            exactSearchQuery={isSearching ? exactSearchQuery : ""}
            selectedNoteId={editor?.note?._id ?? selectedNote?._id}
            isLoading={
              !isSearching &&
              (favoritesView
                ? favorites.loading
                : isLoadingNotes && !activePage) &&
              displayNotes.length === 0
            }
            loadMore={
              !isSearching && !favoritesView && activePage?.nextCursor
                ? {
                    loading: isLoadingNotes,
                    onLoad: () => {
                      if (!notesRequest.current && activePage.nextCursor)
                        void fetchNotes(scope, activePage.nextCursor);
                    },
                  }
                : undefined
            }
            isSearching={isSearching}
            searchMode={searchMode}
            noteListRef={noteListRef}
            newNoteButtonRef={newNoteButtonRef}
            onNewNote={() => beginEditor()}
            onResumeDraft={
              editor && !showMobileDetail
                ? () => openWorkspace(true)
                : undefined
            }
            onViewNote={selectNote}
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
        }
      >
        <section
          className="main-pane"
          ref={detailRef}
          tabIndex={-1}
          aria-label="Note detail"
        >
          {editor ? (
            <>
              <div className="editor-layout-actions">
                <FocusControl />
              </div>
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
                onCreateCollection={createEditorCollection}
              />
            </>
          ) : (
            <NoteView
              selectedNote={selectedNote}
              favorites={favorites}
              isLoadingNote={isLoadingNote}
              onCreateNote={() => beginEditor()}
              hasNotes={
                collectionNotes.length > 0 || Boolean(selectedCollectionFilter)
              }
              onEditNote={beginEditor}
              onDeleteNote={requestDelete}
              deletingNoteId={deletingNoteId}
            />
          )}
        </section>
      </WorkspaceShell>

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
