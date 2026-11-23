import { useRef, useState } from "react";

type Checkout = {
  id: string;
  revision: number;
  state: "pending" | "succeeded" | "failed" | "canceled";
};

type Subscription = {
  plan: "free" | "pro";
  usage: {
    semanticSearchRequests: number;
    noteEmbeddingRequests: number;
  };
};

const checkoutPath = "/mock-billing/checkouts";
const actions = [
  {
    value: "succeed",
    label: "Simulate success",
    result: "Checkout succeeded.",
  },
  { value: "fail", label: "Simulate failure", result: "Checkout failed." },
  {
    value: "cancel_checkout",
    label: "Cancel checkout",
    result: "Checkout canceled.",
  },
] as const;

export default function MockCheckoutPanel({
  apiRequest,
}: {
  apiRequest: <T>(endpoint: string, options?: RequestInit) => Promise<T>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [subscriptionError, setSubscriptionError] = useState(false);

  const refreshSubscription = async () => {
    setSubscriptionError(false);
    try {
      const next = await apiRequest<Subscription>("/subscription");
      if (
        (next?.plan !== "pro" && next?.plan !== "free") ||
        typeof next.usage?.semanticSearchRequests !== "number" ||
        typeof next.usage?.noteEmbeddingRequests !== "number"
      ) {
        throw new Error("Unexpected subscription response.");
      }
      setSubscription(next);
    } catch {
      setSubscription(null);
      setSubscriptionError(true);
    }
  };

  const open = async () => {
    dialogRef.current?.showModal();
    if (busy) return;
    setBusy(true);
    await refreshSubscription();
    setBusy(false);
  };

  const updateCheckout = async (action?: (typeof actions)[number]) => {
    if (busy || (action && checkout?.state !== "pending")) return;
    setBusy(true);
    setCheckoutError("");
    setResult("");
    try {
      const path =
        action && checkout
          ? `${checkoutPath}/${encodeURIComponent(checkout.id)}/actions`
          : checkoutPath;
      const next = await apiRequest<Checkout>(path, {
        method: "POST",
        body: JSON.stringify(
          action && checkout
            ? { action: action.value, expectedRevision: checkout.revision }
            : {},
        ),
      });
      if (
        typeof next?.id !== "string" ||
        !Number.isSafeInteger(next.revision)
      ) {
        throw new Error("Unexpected checkout response.");
      }
      setCheckout(next);
      if (action) setResult(action.result);
    } catch (error) {
      setCheckout(null);
      setCheckoutError(
        error instanceof Error ? error.message : "Checkout request failed.",
      );
    } finally {
      await refreshSubscription();
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="topbar-button" onClick={open}>
        Mock checkout
      </button>
      <dialog
        ref={dialogRef}
        className="mock-checkout-dialog"
        aria-labelledby="mock-checkout-title"
      >
        <h2 id="mock-checkout-title">Mock Pro checkout</h2>
        <p>Pro · $5/month (USD)</p>
        <p>Simulated checkout. No money is charged.</p>
        <div role="status" aria-live="polite">
          {result && <p>{result}</p>}
          {subscription && (
            <>
              <p>
                Current plan: {subscription.plan === "pro" ? "Pro" : "Free"}
              </p>
              <p>
                This month: {subscription.usage.semanticSearchRequests} semantic
                searches, {subscription.usage.noteEmbeddingRequests} note
                embedding requests
              </p>
            </>
          )}
          {busy && <p>Updating checkout details…</p>}
        </div>
        {checkoutError && <p role="alert">{checkoutError}</p>}
        {subscriptionError && (
          <p role="alert">
            Could not refresh the plan. Reopen the panel to retry.
          </p>
        )}
        <div className="mock-checkout-controls">
          {checkout?.state === "pending" ? (
            actions.map((action) => (
              <button
                key={action.value}
                type="button"
                className="secondary-btn"
                disabled={busy}
                onClick={() => void updateCheckout(action)}
              >
                {action.label}
              </button>
            ))
          ) : (
            <button
              type="button"
              className="primary-btn"
              disabled={busy || subscription?.plan === "pro"}
              onClick={() => void updateCheckout()}
            >
              Start or resume checkout
            </button>
          )}
          <form method="dialog">
            <button type="submit" className="secondary-btn">
              Close
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
