import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  followOAuthAuthorization,
  oauthProviders,
  oauthProviderNames,
  type OAuthProvider,
} from "./cookie-session";

type Methods = {
  passwordConfigured: boolean;
  googleConnected: boolean;
  githubConnected?: boolean;
};

export default function SignInMethods({
  apiRequest,
  signal,
  enabled,
  callback,
  feedback,
  onClose,
  onConnect,
}: {
  apiRequest: <T>(path: string, options?: RequestInit) => Promise<T>;
  signal: AbortSignal;
  enabled: Record<OAuthProvider, boolean>;
  callback: OAuthProvider | null;
  feedback?: string;
  onClose: () => void;
  onConnect: (run: () => void) => void;
}) {
  const [methods, setMethods] = useState<Methods>();
  const [error, setError] = useState(feedback ?? "");
  const [pending, setPending] = useState(true);
  const [connected, setConnected] = useState<OAuthProvider | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const callbackRequest = useRef<Promise<unknown> | null>(null);
  const request = useEffectEvent(apiRequest);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    heading.current?.focus();
    return () => element?.close();
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (callback) {
        callbackRequest.current ??= request(
          `/auth/${callback}/finish-connect`,
          {
            method: "POST",
          },
        );
        try {
          await callbackRequest.current;
          if (active && !signal.aborted) setConnected(callback);
        } catch (error) {
          if (active && !signal.aborted)
            setError(
              error instanceof Error
                ? error.message
                : `Could not connect ${oauthProviderNames[callback]}. Try again.`,
            );
        }
      }
      try {
        const value = await request<Methods>("/auth/methods");
        if (active && !signal.aborted) setMethods(value);
      } catch {
        if (active && !signal.aborted)
          setError(
            "Could not load sign-in methods. Reopen this panel to retry.",
          );
      } finally {
        if (active && !signal.aborted) setPending(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [callback, signal]);

  const connect = async (provider: OAuthProvider) => {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await apiRequest(`/auth/${provider}/connect`, {
        method: "POST",
      });
      if (!signal.aborted) followOAuthAuthorization(provider, response);
    } catch (error) {
      if (!signal.aborted) {
        setError(
          error instanceof Error
            ? error.message
            : `Could not connect ${oauthProviderNames[provider]}. Try again.`,
        );
        setPending(false);
      }
    }
  };

  return (
    <dialog
      className="plan-dialog"
      ref={dialog}
      aria-labelledby="sign-in-methods-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <header className="plan-dialog-header">
        <h2 ref={heading} tabIndex={-1} id="sign-in-methods-title">
          Sign-in methods
        </h2>
        <button
          type="button"
          className="secondary-btn"
          onClick={onClose}
          disabled={pending}
        >
          Close
        </button>
      </header>
      {pending && <p role="status">Checking sign-in methods…</p>}
      {error && <p role="alert">{error}</p>}
      {connected && (
        <p role="status">{oauthProviderNames[connected]} is connected.</p>
      )}
      {methods && (
        <>
          <p>
            Password{" "}
            {methods.passwordConfigured ? "configured" : "not configured"}
          </p>
          {oauthProviders.map((provider) => {
            if (
              provider === "github" &&
              !enabled.github &&
              methods.githubConnected === undefined
            )
              return null;
            const name = oauthProviderNames[provider];
            const linked = methods[`${provider}Connected`];
            return (
              <div key={provider}>
                <p>
                  {name} {linked ? "connected" : "not connected"}
                </p>
                {enabled[provider] && !linked && (
                  <>
                    <p>
                      Connect a {name} account to use it the next time you sign
                      in. Sign in to DevMind again first if your session is
                      older than five minutes.
                    </p>
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={pending}
                      onClick={() => onConnect(() => void connect(provider))}
                    >
                      Connect {name}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </>
      )}
    </dialog>
  );
}
