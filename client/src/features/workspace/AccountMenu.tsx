import type { ReactNode } from "react";
import Disclosure from "./Disclosure";

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
}: {
  name: string;
  email?: string;
  plan?: "free" | "pro";
  planControl: ReactNode;
  theme: string;
  onTheme: () => void;
  onExport: () => void;
  exporting: boolean;
  onLogout: () => void;
}) {
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
            ⌄
          </span>
        </>
      }
    >
      {email && <div className="account-email">{email}</div>}
      <button type="button" disabled title="Coming soon">
        Settings
      </button>
      <button type="button" onClick={onTheme}>
        Appearance · {theme === "light" ? "Dark mode" : "Light mode"}
      </button>
      <button type="button" disabled title="Coming soon">
        Language
      </button>
      <button type="button" disabled title="Coming soon">
        Get help
      </button>
      <button type="button" disabled title="Coming soon">
        Learn more
      </button>
      {planControl}
      <button type="button" onClick={onExport} disabled={exporting}>
        {exporting ? "Exporting…" : "Export all notes"}
      </button>
      <button type="button" onClick={onLogout}>
        Log out
      </button>
    </Disclosure>
  );
}
