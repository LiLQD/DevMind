import type { ReactNode } from "react";

type TopBarProps = {
  notesCount: number;
  userLabel: string;
  accountControl?: ReactNode;
  theme: string;
  onToggleTheme: () => void;
  onLogout: () => void;
  onExportNotes: () => void;
  isExportingNotes: boolean;
};

export default function TopBar({
  notesCount,
  userLabel,
  accountControl,
  theme,
  onToggleTheme,
  onLogout,
  onExportNotes,
  isExportingNotes,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="brand-name">DevMind</span>
        <span className="note-count">
          {notesCount} {notesCount === 1 ? "note" : "notes"}
        </span>
      </div>
      <div
        className="topbar-right"
        role="group"
        aria-label="Workspace controls"
      >
        <span className="account-label">{userLabel}</span>
        {accountControl}
        <button
          type="button"
          className="topbar-button"
          onClick={onExportNotes}
          disabled={isExportingNotes}
        >
          {isExportingNotes ? "Exporting…" : "Export Markdown"}
        </button>
        <button type="button" className="topbar-button" onClick={onToggleTheme}>
          {theme === "light" ? "Dark mode" : "Light mode"}
        </button>
        <button
          type="button"
          className="topbar-button topbar-button-quiet"
          onClick={onLogout}
        >
          Logout
        </button>
      </div>
    </header>
  );
}
