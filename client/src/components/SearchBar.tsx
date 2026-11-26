import type { FormEventHandler, Ref } from "react";
import type { SearchMode } from "../types";
import WorkspaceIcon from "../features/workspace/WorkspaceIcon";

type SearchBarProps = {
  mode: SearchMode;
  setMode: (mode: SearchMode) => void;
  query: string;
  setQuery: (query: string) => void;
  onSearch: FormEventHandler<HTMLFormElement>;
  onClearSearch: () => void;
  isSearchingAI: boolean;
  searchInputRef: Ref<HTMLInputElement>;
};

export default function SearchBar({
  mode,
  setMode,
  query,
  setQuery,
  onSearch,
  onClearSearch,
  isSearchingAI,
  searchInputRef,
}: SearchBarProps) {
  return (
    <div className="search-bar-container">
      <form
        onSubmit={onSearch}
        className="search-bar-form"
        role="search"
        aria-label="Search notes"
      >
        <label className="search-label" htmlFor="notes-search">
          Search notes
        </label>
        <div className="search-bar-input-wrap">
          <span className="search-field-icon">
            <WorkspaceIcon name="search" />
          </span>
          <input
            id="notes-search"
            ref={searchInputRef}
            type="text"
            placeholder={
              mode === "exact"
                ? "Paste an error or phrase"
                : "Describe the problem or fix"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="search-bar-input"
            maxLength={1000}
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              className="search-bar-clear"
              aria-label="Clear search"
              onClick={onClearSearch}
            >
              ×
            </button>
          )}
        </div>
        <select
          className="search-bar-mode"
          aria-label="Search mode"
          value={mode}
          onChange={(event) =>
            setMode(event.target.value === "exact" ? "exact" : "semantic")
          }
          disabled={isSearchingAI}
        >
          <option value="semantic">By meaning</option>
          <option value="exact">Exact text</option>
        </select>
        <button
          type="submit"
          className="search-bar-submit"
          disabled={isSearchingAI}
        >
          {isSearchingAI ? "Searching…" : "Search"}
        </button>
      </form>
    </div>
  );
}
