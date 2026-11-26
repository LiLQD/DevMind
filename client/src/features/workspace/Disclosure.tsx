import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

export default function Disclosure({
  label,
  trigger,
  children,
  className,
  beforeDismiss,
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  className: string;
  beforeDismiss?: () => boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        document.querySelector("dialog[open]")
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (beforeDismiss?.() === false) return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open, beforeDismiss]);

  return (
    <div className={className} ref={root}>
      <button
        ref={button}
        type="button"
        className="secondary-btn disclosure-trigger"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          setOpen(true);
          requestAnimationFrame(() =>
            panel.current
              ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
              ?.focus(),
          );
        }}
      >
        {trigger}
      </button>
      <div
        id={id}
        ref={panel}
        className="workspace-popover"
        hidden={!open}
        data-workspace-overlay={open ? "" : undefined}
        onClick={(event) => {
          if (
            !(event.target instanceof Element) ||
            !event.target.closest("button:not(:disabled)") ||
            event.target.closest("[data-keep-popover-open]") ||
            event.target.closest("dialog") ||
            document.querySelector("dialog[open]")
          )
            return;
          setOpen(false);
          if (!document.querySelector("dialog[open]")) button.current?.focus();
        }}
        onBlur={(event) => {
          if (
            event.relatedTarget &&
            !root.current?.contains(event.relatedTarget) &&
            !document.querySelector("dialog[open]")
          )
            setOpen(false);
        }}
        onKeyDown={(event) => {
          if (
            !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) ||
            (event.target instanceof Element &&
              event.target.closest("dialog")) ||
            document.querySelector("dialog[open]")
          )
            return;
          const items = [
            ...(panel.current?.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ) ?? []),
          ].filter(
            (item) =>
              !item.closest("dialog") && item.getClientRects().length > 0,
          );
          if (!items.length) return;
          event.preventDefault();
          const index = items.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    items.length) %
                  items.length;
          items[next]?.focus();
        }}
      >
        {children}
      </div>
    </div>
  );
}
