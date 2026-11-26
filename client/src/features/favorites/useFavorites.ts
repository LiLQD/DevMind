import { useEffect, useEffectEvent, useMemo, useState } from "react";
import type { Note } from "../../types";

type Request = <T>(path: string, options?: RequestInit) => Promise<T>;
type FavoriteState = { favoritedAt: string | null };
type Change = { note: Note; favoritedAt: string | null };

export function useFavorites(
  sessionKey: string | undefined,
  signal: AbortSignal,
  request: Request,
) {
  const work = useMemo(
    () => ({
      pending: new Set<string>(),
      changes: new Map<string, Change>(),
      deleted: new Set<string>(),
    }),
    [signal],
  );
  const [snapshot, setSnapshot] = useState<{
    signal: AbortSignal;
    notes: Note[];
    error: boolean;
  }>();
  const [revision, bump] = useState(0);
  const [retry, retryLoad] = useState(0);
  const [failure, setFailure] = useState<{
    signal: AbortSignal;
    message: string;
  }>();
  const load = useEffectEvent(request);
  useEffect(() => {
    if (!sessionKey) return;
    const controller = new AbortController();
    void load<Note[]>("/notes?favorite=true", {
      signal: controller.signal,
    }).then(
      (notes) => {
        if (!signal.aborted && !controller.signal.aborted)
          setSnapshot({
            signal,
            notes: Array.isArray(notes)
              ? notes.filter((note) => Boolean(note.favoritedAt))
              : [],
            error: !Array.isArray(notes),
          });
      },
      () => {
        if (!signal.aborted && !controller.signal.aborted)
          setSnapshot({ signal, notes: [], error: true });
      },
    );
    return () => controller.abort();
  }, [sessionKey, signal, retry]);

  const publish = () => bump((number) => number + 1);
  const favorites = useMemo(() => {
    // Confirmed mutations override earlier list responses for this session.
    const entries = new Map(
      (snapshot?.signal === signal ? snapshot.notes : []).map((note) => [
        note._id,
        note,
      ]),
    );
    for (const [id, change] of work.changes) {
      if (change.favoritedAt)
        entries.set(id, { ...change.note, favoritedAt: change.favoritedAt });
      else entries.delete(id);
    }
    for (const id of work.deleted) entries.delete(id);
    return Array.from(entries.values()).sort(
      (a, b) =>
        (b.favoritedAt ?? "").localeCompare(a.favoritedAt ?? "") ||
        b._id.localeCompare(a._id),
    );
    // The session-local mutation sets publish changes through the revision.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, signal, work, revision]);
  const favoriteAt = (note: Note) => {
    const change = work.changes.get(note._id);
    return change
      ? change.favoritedAt
      : (note.favoritedAt ??
          favorites.find((item) => item._id === note._id)?.favoritedAt ??
          null);
  };

  async function toggle(note: Note) {
    if (
      signal.aborted ||
      work.pending.has(note._id) ||
      work.deleted.has(note._id)
    )
      return;
    const { _id: id } = note;
    const favorite = !favoriteAt(note);
    work.pending.add(id);
    setFailure(undefined);
    publish();
    const apply = (favoritedAt: string | null) => {
      if (!signal.aborted && !work.deleted.has(id)) {
        work.changes.set(id, {
          note: work.changes.get(id)?.note ?? note,
          favoritedAt,
        });
      }
    };
    try {
      const result = await request<FavoriteState>(`/notes/${id}/favorite`, {
        method: "PUT",
        body: JSON.stringify({ favorite }),
      });
      if (result.favoritedAt !== null && typeof result.favoritedAt !== "string")
        throw new Error("Unexpected favorite response");
      apply(result.favoritedAt);
    } catch {
      if (signal.aborted || work.deleted.has(id)) return;
      try {
        const current = await request<Note>(`/notes/${id}`);
        apply(current.favoritedAt ?? null);
        if (Boolean(current.favoritedAt) === favorite) return;
      } catch {
        // Keep the last confirmed state if the server cannot be reached.
      }
      if (!signal.aborted && !work.deleted.has(id))
        setFailure({
          signal,
          message:
            "Could not confirm the favorite change. Select the star again to retry.",
        });
    } finally {
      work.pending.delete(id);
      if (!signal.aborted) publish();
    }
  }

  return {
    favorites,
    favoriteAt,
    toggle,
    pending: (id: string) => work.pending.has(id),
    loading: Boolean(sessionKey && snapshot?.signal !== signal),
    loadError: snapshot?.signal === signal && snapshot.error,
    retryLoad: () => {
      setSnapshot(undefined);
      retryLoad((number) => number + 1);
    },
    dismissFailure: () => setFailure(undefined),
    failure: failure?.signal === signal ? failure.message : undefined,
    remove: (id: string) => {
      work.deleted.add(id);
      work.changes.delete(id);
      publish();
    },
    updateNote: (note: Note) => {
      const favoritedAt = favoriteAt(note);
      if (
        favoritedAt ||
        work.changes.has(note._id) ||
        work.pending.has(note._id)
      ) {
        work.changes.set(note._id, { note, favoritedAt });
        publish();
      }
    },
  };
}
