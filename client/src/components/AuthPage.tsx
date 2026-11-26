import type { FormEventHandler } from "react";

type AuthPageProps = {
  isLogin: boolean;
  onSwitchMode: () => void;
  error: string;
  isPending: boolean;
  googleEnabled?: boolean;
  googlePending?: boolean;
  onGoogleSignIn: () => void;
  onEdit: () => void;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  name: string;
  setName: (name: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
};

export default function AuthPage({
  isLogin,
  onSwitchMode,
  error,
  isPending,
  googleEnabled,
  googlePending,
  onGoogleSignIn,
  onEdit,
  email,
  setEmail,
  password,
  setPassword,
  name,
  setName,
  onSubmit,
}: AuthPageProps) {
  const pendingLabel = isLogin ? "Signing in…" : "Creating account…";

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="auth-brand">
          <h1>DevMind</h1>
          <p>Your second brain for developers</p>
        </div>
        <form onSubmit={onSubmit} onChange={onEdit} className="auth-form">
          <div>
            <h2>{isLogin ? "Sign in" : "Create account"}</h2>
            <p className="auth-note">
              {isLogin
                ? "Access your personal technical knowledge."
                : "Start building your developer knowledge base."}
            </p>
          </div>
          {!isLogin && (
            <label>
              <span>Name</span>
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                readOnly={isPending}
                required
              />
            </label>
          )}
          <label>
            <span>Email</span>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={isPending}
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              readOnly={isPending}
              required
            />
          </label>
          <div className="auth-submit">
            <div className="auth-error" role="alert">
              {error}
            </div>
            <button type="submit" className="primary-btn" disabled={isPending}>
              {isPending
                ? pendingLabel
                : isLogin
                  ? "Sign in"
                  : "Create account"}
            </button>
            <span className="auth-status" role="status">
              {isPending ? pendingLabel : ""}
            </span>
          </div>
          <button
            type="button"
            className="text-btn auth-switch"
            onClick={onSwitchMode}
            disabled={isPending}
          >
            {isLogin ? "Create an account" : "Back to sign in"}
          </button>
        </form>
        {googleEnabled && (
          <button
            type="button"
            className="google-sign-in-button"
            disabled={isPending}
            aria-busy={googlePending}
            onClick={onGoogleSignIn}
          >
            <img src="/google-sign-in-logo.png" alt="" width="18" height="18" />
            {googlePending ? "Opening Google…" : "Continue with Google"}
          </button>
        )}
      </div>
    </div>
  );
}
