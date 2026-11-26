import { useState } from "react";
import type { ReactNode } from "react";
import type { Collection } from "../../types";
import Disclosure from "./Disclosure";
import WorkspaceIcon from "./WorkspaceIcon";
import type { WorkspaceIconName } from "./WorkspaceIcon";

export const uncategorized = "__uncategorized__";

export default function NavigationSidebar({
  collections,
  active,
  onFilter,
  onCreate,
  onImport,
  bulkImport,
  account,
  counts,
}: {
  collections: Collection[];
  active: string | null;
  onFilter: (value: string | null) => void;
  onCreate: (name: string) => Promise<Collection | null>;
  onImport: () => void;
  bulkImport: ReactNode;
  account: ReactNode;
  counts: ReadonlyMap<string, number> | null;
}) {
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  function filter(id: string | null, label: string, icon: WorkspaceIconName) {
    return (
      <button
        type="button"
        className="nav-item"
        data-close-drawer
        aria-pressed={active === id}
        onClick={() => onFilter(id)}
        title={label}
      >
        <span className="nav-icon" aria-hidden="true">
          <WorkspaceIcon name={icon} />
        </span>
        <span className="nav-label">{label}</span>
        {counts && id !== null && (
          <span className="nav-count">{counts.get(id) ?? 0}</span>
        )}
      </button>
    );
  }
  return (
    <aside className="primary-navigation" aria-label="Primary navigation">
      <div className="workspace-brand">
        <WorkspaceIcon name="brand" /> <strong>DevMind</strong>
      </div>
      <nav aria-label="Notes and collections" className="navigation-scroll">
        {filter(null, "Notes", "note")}
        <button
          type="button"
          className="nav-item"
          disabled
          title="Coming soon"
          aria-label="Favorites, coming soon"
        >
          <span className="nav-icon" aria-hidden="true">
            <WorkspaceIcon name="star" />
          </span>
          <span className="nav-label">Favorites</span>
        </button>
        {bulkImport ? (
          <Disclosure
            className="import-disclosure"
            label="Import md"
            trigger={
              <>
                <span className="nav-icon" aria-hidden="true">
                  <WorkspaceIcon name="import" />
                </span>
                <span className="nav-label">Import md</span>
              </>
            }
          >
            <button type="button" data-close-drawer onClick={onImport}>
              Import Markdown
            </button>
            {bulkImport}
          </Disclosure>
        ) : (
          <button
            type="button"
            className="nav-item"
            data-close-drawer
            onClick={onImport}
          >
            <span className="nav-icon" aria-hidden="true">
              <WorkspaceIcon name="import" />
            </span>
            <span className="nav-label">Import md</span>
          </button>
        )}
        <div className="nav-collections-heading">
          <span>Collections</span>
          <button
            type="button"
            className="secondary-btn"
            aria-label="Create collection"
            aria-expanded={creating}
            onClick={() => setCreating(!creating)}
          >
            +
          </button>
        </div>
        {creating && (
          <form
            className="nav-create-collection"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!name.trim() || pending) return;
              setPending(true);
              try {
                const collection = await onCreate(name);
                if (collection) {
                  setName("");
                  setCreating(false);
                  onFilter(collection._id);
                }
              } finally {
                setPending(false);
              }
            }}
          >
            <input
              aria-label="New collection name"
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
            />
            <button
              className="secondary-btn"
              disabled={!name.trim() || pending}
            >
              {pending ? "Creating…" : "Create"}
            </button>
          </form>
        )}
        {collections.map((item) => (
          <div key={item._id}>{filter(item._id, item.name, "collection")}</div>
        ))}
        {filter(uncategorized, "Uncategorized", "archive")}
      </nav>
      {account}
    </aside>
  );
}
