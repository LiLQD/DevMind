export default function TopBar({ notesCount, userLabel, theme, onToggleTheme, onLogout }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="brand-lockup">
          <span className="brand-name">DevMind</span>
          <span className="brand-tagline">Your second brain for developers</span>
        </div>
        <span className="note-count">{notesCount} notes</span>
      </div>
      <div className="topbar-right">
        <button type="button" className="theme-btn" onClick={onToggleTheme}>
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>
        <span className="account-label">{userLabel}</span>
        <button type="button" className="secondary-btn" onClick={onLogout}>Logout</button>
      </div>
    </header>
  );
}
