import type { ReactNode } from "react";
import type { Collection } from "../../types";
import Disclosure from "./Disclosure";
import CollectionPopover from "./CollectionPopover";
import { PanelControl } from "./WorkspaceShell";
import WorkspaceIcon from "./WorkspaceIcon";
import type { WorkspaceIconName } from "./WorkspaceIcon";

export const favoritesFilter = "__favorites__";
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
  onCreate: (name: string) => Promise<Collection>;
  onImport: () => void;
  bulkImport: ReactNode;
  account: ReactNode;
  counts: ReadonlyMap<string, number> | null;
}) {
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
        {counts && id !== null && id !== favoritesFilter && (
          <span className="nav-count">{counts.get(id) ?? 0}</span>
        )}
      </button>
    );
  }
  return (
    <aside className="primary-navigation" aria-label="Primary navigation">
      <div className="workspace-brand">
        <WorkspaceIcon name="brand" /> <strong>DevMind</strong>
        <PanelControl panel="navigation" />
      </div>
      <nav aria-label="Notes and collections" className="navigation-scroll">
        {filter(null, "Notes", "note")}
        {filter(favoritesFilter, "Favorites", "star")}
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
            aria-label="Import md"
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
          <CollectionPopover onCreate={onCreate} />
        </div>
        {collections.map((item) => (
          <div key={item._id}>{filter(item._id, item.name, "collection")}</div>
        ))}
        <div>{filter(uncategorized, "Uncategorized", "archive")}</div>
      </nav>
      {account}
    </aside>
  );
}
