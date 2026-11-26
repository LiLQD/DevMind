import WorkspaceIcon from "../features/workspace/WorkspaceIcon";
import { useRef, useState } from "react";

type Checkout = {
  id: string;
  revision: number;
  state: "pending" | "succeeded" | "failed" | "canceled";
  price: { amountCents: number; currency: "USD"; interval: "month" };
};

type Subscription = {
  plan: "free" | "pro";
  entitlements?: { bulkMarkdownImport?: boolean };
  usage: {
    semanticSearchRequests: number;
    noteEmbeddingRequests: number;
    resetAt: string;
  };
};

const checkoutPath = "/mock-billing/checkouts";
const checkoutResults = {
  succeed: "Your Pro plan is active.",
  fail: "Checkout failed. You can try again.",
  cancel_checkout: "Checkout canceled.",
};
type CheckoutAction = keyof typeof checkoutResults;
const resetDateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeZone: "UTC",
});

function UsageSummary({ subscription }: { subscription: Subscription }) {
  const { plan, usage } = subscription;
  return (
    <>
      <div className="plan-current">
        <span>Current plan</span>
        <strong>{plan === "pro" ? "Pro" : "Free"}</strong>
      </div>
      <dl className="plan-usage">
        <div>
          <dt>Semantic searches this month</dt>
          <dd>{usage.semanticSearchRequests.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Note embedding requests this month</dt>
          <dd>{usage.noteEmbeddingRequests.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Usage resets</dt>
          <dd>
            <time dateTime={usage.resetAt}>
              {resetDateFormat.format(new Date(usage.resetAt))} UTC
            </time>
          </dd>
        </div>
      </dl>
    </>
  );
}

export default function PlanPanel({
  apiRequest,
  checkoutEnabled,
  onBulkImportAccessChange,
  triggerLabel = "Plan & usage",
}: {
  apiRequest: <T>(endpoint: string, options?: RequestInit) => Promise<T>;
  checkoutEnabled: boolean;
  triggerLabel?: string;
  onBulkImportAccessChange: (
    allowed: boolean,
    plan: Subscription["plan"],
  ) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [subscriptionError, setSubscriptionError] = useState(false);
  const activeCheckout =
    checkoutEnabled && checkout?.state === "pending" ? checkout : null;

  const refreshSubscription = async () => {
    setSubscriptionError(false);
    try {
      const next = await apiRequest<Subscription>("/subscription");
      if (
        (next?.plan !== "pro" && next?.plan !== "free") ||
        typeof next.usage?.semanticSearchRequests !== "number" ||
        typeof next.usage?.noteEmbeddingRequests !== "number" ||
        typeof next.usage?.resetAt !== "string" ||
        !Number.isFinite(Date.parse(next.usage.resetAt))
      ) {
        throw new Error("Unexpected subscription response.");
      }
      setSubscription(next);
      onBulkImportAccessChange(
        next.entitlements?.bulkMarkdownImport === true,
        next.plan,
      );
    } catch {
      setSubscription(null);
      setSubscriptionError(true);
    }
  };

  const open = async () => {
    setCheckout(null);
    dialogRef.current?.showModal();
    titleRef.current?.focus();
    if (busy) return;
    setBusy(true);
    await refreshSubscription();
    setBusy(false);
  };

  const updateCheckout = async (action?: CheckoutAction) => {
    if (busy || !checkoutEnabled || (action && !activeCheckout)) return;
    setBusy(true);
    setCheckoutError("");
    setResult("");
    try {
      const path =
        action && activeCheckout
          ? `${checkoutPath}/${encodeURIComponent(activeCheckout.id)}/actions`
          : checkoutPath;
      const next = await apiRequest<Checkout>(path, {
        method: "POST",
        body: JSON.stringify(
          action && activeCheckout
            ? { action, expectedRevision: activeCheckout.revision }
            : {},
        ),
      });
      if (
        typeof next?.id !== "string" ||
        !Number.isSafeInteger(next.revision) ||
        !Number.isSafeInteger(next.price?.amountCents) ||
        next.price?.currency !== "USD" ||
        next.price?.interval !== "month"
      ) {
        throw new Error("Unexpected checkout response.");
      }
      setCheckout(next);
      if (action) setResult(checkoutResults[action]);
    } catch (error) {
      setCheckout(null);
      setCheckoutError(
        error instanceof Error ? error.message : "Checkout request failed.",
      );
    } finally {
      if (action) await refreshSubscription();
      setBusy(false);
      if (dialogRef.current?.open) titleRef.current?.focus();
    }
  };

  return (
    <>
      <button type="button" className="topbar-button" onClick={open}>
        <WorkspaceIcon name="plan" /> {triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        className="plan-dialog"
        aria-labelledby="plan-dialog-title"
      >
        <header className="plan-dialog-header">
          <h2 id="plan-dialog-title" ref={titleRef} tabIndex={-1}>
            {activeCheckout ? "Checkout" : "Plan & usage"}
          </h2>
          <form method="dialog">
            <button type="submit" className="secondary-btn">
              Close
            </button>
          </form>
        </header>
        <div role="status">
          {result && <p>{result}</p>}
          {busy && <p>Updating plan details…</p>}
        </div>
        {checkoutError && <p role="alert">{checkoutError}</p>}
        {subscriptionError && (
          <p role="alert">
            Could not load your plan. Reopen this panel to retry.
          </p>
        )}
        {activeCheckout ? (
          <div className="plan-card">
            <div className="plan-order">
              <div>
                <h3>DevMind Pro</h3>
                <p>Monthly plan</p>
              </div>
              <strong className="plan-price">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: activeCheckout.price.currency,
                }).format(activeCheckout.price.amountCents / 100)}
              </strong>
            </div>
            <p className="plan-demo">Demo checkout</p>
            <button
              type="button"
              className="primary-btn plan-upgrade"
              disabled={busy}
              onClick={() => void updateCheckout("succeed")}
            >
              Confirm upgrade
            </button>
            <button
              type="button"
              className="secondary-btn plan-upgrade"
              disabled={busy}
              onClick={() => void updateCheckout("cancel_checkout")}
            >
              Cancel checkout
            </button>
            <details className="plan-demo-options">
              <summary>Demo options</summary>
              <button
                type="button"
                className="secondary-btn"
                disabled={busy}
                onClick={() => void updateCheckout("fail")}
              >
                Simulate checkout failure
              </button>
            </details>
          </div>
        ) : (
          <>
            {subscription && <UsageSummary subscription={subscription} />}
            {checkoutEnabled && subscription?.plan === "free" && (
              <div className="plan-card">
                <div className="plan-order">
                  <div>
                    <h3>DevMind Pro</h3>
                    <p>Higher monthly semantic search limit</p>
                  </div>
                  <span>
                    <strong className="plan-price">$5</strong> / mo
                  </span>
                </div>
                <button
                  type="button"
                  className="primary-btn plan-upgrade"
                  disabled={busy}
                  onClick={() => void updateCheckout()}
                >
                  Upgrade to Pro
                </button>
              </div>
            )}
          </>
        )}
      </dialog>
    </>
  );
}
