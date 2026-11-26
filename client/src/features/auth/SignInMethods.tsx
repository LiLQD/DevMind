import { useEffect, useEffectEvent, useRef, useState } from "react";
import { followGoogleAuthorization } from "./cookie-session";

type Methods = { passwordConfigured: boolean; googleConnected: boolean };

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
  enabled: boolean;
  callback: boolean;
  feedback?: string;
  onClose: () => void;
  onConnect: (run: () => void) => void;
}) {
  const [methods, setMethods] = useState<Methods>();
  const [error, setError] = useState(feedback ?? "");
  const [pending, setPending] = useState(true);
  const [connected, setConnected] = useState(false);
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
        callbackRequest.current ??= request("/auth/google/finish-connect", {
          method: "POST",
        });
        try {
          await callbackRequest.current;
          if (active && !signal.aborted) setConnected(true);
        } catch (error) {
          if (active && !signal.aborted)
            setError(
              error instanceof Error
                ? error.message
                : "Could not connect Google. Try again.",
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

  const connect = async () => {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await apiRequest("/auth/google/connect", {
        method: "POST",
      });
      if (!signal.aborted) followGoogleAuthorization(response);
    } catch (error) {
      if (!signal.aborted) {
        setError(
          error instanceof Error
            ? error.message
            : "Could not connect Google. Try again.",
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
      {connected && <p role="status">Google is connected.</p>}
      {methods && (
        <>
          <p>
            Password{" "}
            {methods.passwordConfigured ? "configured" : "not configured"}
          </p>
          <p>
            Google {methods.googleConnected ? "connected" : "not connected"}
          </p>
          {enabled && !methods.googleConnected && (
            <>
              <p>
                Connect a Google account to use it the next time you sign in.
                Sign in to DevMind again first if your session is older than
                five minutes.
              </p>
              <button
                type="button"
                className="primary-btn"
                disabled={pending}
                onClick={() => onConnect(() => void connect())}
              >
                Connect Google
              </button>
            </>
          )}
        </>
      )}
    </dialog>
  );
}
