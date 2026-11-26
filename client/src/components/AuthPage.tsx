import type { FormEventHandler } from "react";
import {
  oauthProviders,
  oauthProviderNames,
  type OAuthProvider,
} from "../features/auth/cookie-session";

type AuthPageProps = {
  isLogin: boolean;
  registrationStep?: "email" | "finish";
  verificationRequested: boolean;
  onSwitchMode: () => void;
  error: string;
  isPending: boolean;
  oauthEnabled: Record<OAuthProvider, boolean>;
  oauthPending: OAuthProvider | null;
  onOAuthSignIn: (provider: OAuthProvider) => void;
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
  registrationStep,
  verificationRequested,
  onSwitchMode,
  error,
  isPending,
  oauthEnabled,
  oauthPending,
  onOAuthSignIn,
  onEdit,
  email,
  setEmail,
  password,
  setPassword,
  name,
  setName,
  onSubmit,
}: AuthPageProps) {
  const emailStep = registrationStep === "email";
  const finishStep = registrationStep === "finish";
  const pendingLabel = emailStep
    ? "Sending verification email…"
    : isLogin
      ? "Signing in…"
      : "Creating account…";
  const submitLabel = emailStep
    ? verificationRequested
      ? "Resend verification email"
      : "Send verification email"
    : isLogin
      ? "Sign in"
      : "Create account";

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="auth-brand">
          <h1>DevMind</h1>
          <p>Your second brain for developers</p>
        </div>
        <form onSubmit={onSubmit} onChange={onEdit} className="auth-form">
          <div>
            <h2>
              {isLogin
                ? "Sign in"
                : finishStep
                  ? "Finish creating your account"
                  : "Create account"}
            </h2>
            <p className="auth-note">
              {emailStep
                ? "Enter your email to receive a verification link."
                : finishStep
                  ? "Enter your name and choose a password."
                  : isLogin
                    ? "Access your personal technical knowledge."
                    : "Start building your developer knowledge base."}
            </p>
          </div>
          {!isLogin && !emailStep && (
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
          {!finishStep && (
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
          )}
          {!emailStep && (
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
          )}
          <div className="auth-submit">
            <div className="auth-error" role="alert">
              {error}
            </div>
            <button type="submit" className="primary-btn" disabled={isPending}>
              {isPending ? pendingLabel : submitLabel}
            </button>
            {emailStep && verificationRequested && !isPending ? (
              <p className="auth-note" role="status">
                If this address can be registered, check your inbox for a
                verification link.
              </p>
            ) : (
              <span className="auth-status" role="status">
                {isPending ? pendingLabel : ""}
              </span>
            )}
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
        {oauthProviders
          .filter((provider) => !finishStep && oauthEnabled[provider])
          .map((provider) => {
            const name = oauthProviderNames[provider];
            const pending = oauthPending === provider;
            return (
              <button
                key={provider}
                type="button"
                className="oauth-sign-in-button"
                disabled={isPending}
                aria-busy={pending}
                onClick={() => onOAuthSignIn(provider)}
              >
                {provider === "google" && (
                  <img
                    src="/google-sign-in-logo.png"
                    alt=""
                    width="18"
                    height="18"
                  />
                )}
                {pending ? `Opening ${name}…` : `Continue with ${name}`}
              </button>
            );
          })}
      </div>
    </div>
  );
}
