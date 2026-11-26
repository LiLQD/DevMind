import { useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import Disclosure from "./Disclosure";
import WorkspaceIcon from "./WorkspaceIcon";

export default function AccountMenu({
  name,
  email,
  plan,
  planControl,
  theme,
  onTheme,
  onExport,
  exporting,
  onLogout,
  onSignInMethods,
}: {
  name: string;
  email?: string;
  plan?: "free" | "pro";
  planControl: ReactNode;
  theme: "light" | "dark";
  onTheme: (value: "light" | "dark") => void;
  onExport: () => void;
  exporting: boolean;
  onLogout: () => void;
  onSignInMethods: () => void;
}) {
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const appearance = useRef<HTMLButtonElement>(null);
  const appearanceId = useId();
  const initials = name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("")
    .toUpperCase();
  return (
    <Disclosure
      className="account-menu"
      label="Account menu"
      beforeDismiss={() => {
        if (!appearanceOpen) return true;
        setAppearanceOpen(false);
        appearance.current?.focus();
        return false;
      }}
      trigger={
        <>
          <span className="account-avatar" aria-hidden="true">
            {initials || "A"}
          </span>
          <span className="account-name">
            <strong title={name}>{name}</strong>
            <small>
              {plan === "pro" ? "Pro" : plan === "free" ? "Free" : ""}
            </small>
          </span>
          <span className="account-chevron" aria-hidden="true">
            <WorkspaceIcon name="down" />
          </span>
        </>
      }
    >
      {email && <div className="account-email">{email}</div>}
      <button type="button" disabled title="Coming soon">
        <WorkspaceIcon name="settings" /> Settings
      </button>
      <button
        type="button"
        data-keep-popover-open
        ref={appearance}
        aria-expanded={appearanceOpen}
        aria-controls={appearanceId}
        onClick={() => setAppearanceOpen(!appearanceOpen)}
      >
        <WorkspaceIcon name="sun" /> Appearance
        <span className="account-row-end">
          <WorkspaceIcon name={appearanceOpen ? "down" : "chevron"} />
        </span>
      </button>
      <div
        className="appearance-options"
        id={appearanceId}
        hidden={!appearanceOpen}
        role="group"
        aria-label="Appearance"
      >
        {(["light", "dark"] as const).map((option) => (
          <button
            key={option}
            type="button"
            data-keep-popover-open
            aria-pressed={theme === option}
            onClick={() => onTheme(option)}
          >
            <WorkspaceIcon name={option === "light" ? "sun" : "moon"} />
            {option === "light" ? "Light" : "Dark"}
            {theme === option && (
              <span className="account-row-end">
                <WorkspaceIcon name="check" />
              </span>
            )}
          </button>
        ))}
      </div>
      <button type="button" disabled title="Coming soon">
        <WorkspaceIcon name="globe" /> Language
      </button>
      <button type="button" disabled title="Coming soon">
        <WorkspaceIcon name="help" /> Get help
      </button>
      <button type="button" disabled title="Coming soon">
        <WorkspaceIcon name="info" /> Learn more
      </button>
      <div className="account-menu-divider" role="separator" />
      <button type="button" onClick={onSignInMethods}>
        <WorkspaceIcon name="settings" /> Sign-in methods
      </button>
      {planControl}
      <button type="button" onClick={onExport} disabled={exporting}>
        <WorkspaceIcon name="import" />{" "}
        {exporting ? "Exporting…" : "Export all notes"}
      </button>
      <div className="account-menu-divider" role="separator" />
      <button type="button" onClick={onLogout}>
        <WorkspaceIcon name="logout" /> Log out
      </button>
    </Disclosure>
  );
}
