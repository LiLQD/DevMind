import type { Note } from "../../types";
import WorkspaceIcon from "../workspace/WorkspaceIcon";

export type FavoriteControls = {
  favoriteAt: (note: Note) => string | null;
  pending: (id: string) => boolean;
  toggle: (note: Note) => Promise<void>;
};

export default function FavoriteButton({
  note,
  controls,
  row = false,
}: {
  note: Note;
  controls: FavoriteControls;
  row?: boolean;
}) {
  const active = Boolean(controls.favoriteAt(note));
  const pending = controls.pending(note._id);
  const label = active ? "Remove from favorites" : "Add to favorites";
  return (
    <button
      type="button"
      className={
        row ? "favorite-star" : "workspace-icon-button favorite-reader-star"
      }
      title={label}
      aria-label={`${label}: ${note.title}`}
      aria-pressed={active}
      aria-busy={pending}
      aria-disabled={pending}
      onClick={() => void controls.toggle(note)}
    >
      <WorkspaceIcon name="star" />
    </button>
  );
}
