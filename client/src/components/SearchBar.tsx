import type { FormEventHandler, Ref } from "react";

type SearchBarProps = {
  query: string;
  setQuery: (query: string) => void;
  onSearch: FormEventHandler<HTMLFormElement>;
  onClearSearch: () => void;
  isSearchingAI: boolean;
  searchInputRef: Ref<HTMLInputElement>;
};

export default function SearchBar({
  query,
  setQuery,
  onSearch,
  onClearSearch,
  isSearchingAI,
  searchInputRef,
}: SearchBarProps) {
  return (
    <div className="search-bar-container">
      <form onSubmit={onSearch} className="search-bar-form">
        <div className="search-bar-input-wrap">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search by meaning… describe the problem, idea, or solution you remember."
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
        <button
          type="submit"
          className="search-bar-submit"
          disabled={isSearchingAI}
        >
          {isSearchingAI ? "Searching…" : "Search"}
        </button>
      </form>
      <div className="search-bar-meta">
        <span>Natural-language search · up to 1,000 characters</span>
        <div className="search-bar-shortcuts">
          <span>
            <kbd>⌘/Ctrl K</kbd> focus
          </span>
          <span>
            <kbd>Enter</kbd> search
          </span>
        </div>
      </div>
    </div>
  );
}
