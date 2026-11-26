import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { Collection } from "../../types";
import WorkspaceIcon from "./WorkspaceIcon";

export default function CollectionPopover({
  onCreate,
}: {
  onCreate: (name: string) => Promise<Collection>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const inputId = useId();

  function close(restoreFocus: boolean) {
    setOpen(false);
    setName("");
    setError("");
    if (restoreFocus) trigger.current?.focus();
  }

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const popup = form.current;
      if (!anchor || !popup) return;
      const viewport = document.documentElement;
      const left = Math.max(
        12,
        Math.min(
          anchor.right - popup.offsetWidth,
          viewport.clientWidth - popup.offsetWidth - 12,
        ),
      );
      const above =
        anchor.bottom + 6 + popup.offsetHeight + 12 > viewport.clientHeight;
      const top = above
        ? Math.max(12, anchor.top - popup.offsetHeight - 6)
        : anchor.bottom + 6;
      popup.style.left = left + "px";
      popup.style.top = top + "px";
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    const observer = new ResizeObserver(position);
    if (form.current) observer.observe(form.current);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      observer.disconnect();
    };
  }, [open]);

  useLayoutEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!busy.current && !root.current?.contains(event.target as Node))
        close(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        document.querySelector("dialog[open]")
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!busy.current) close(true);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onEscape, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onEscape, true);
    };
  }, [open]);

  return (
    <div ref={root} className="collection-popover-anchor">
      <button
        type="button"
        ref={trigger}
        className="workspace-icon-button"
        aria-label="Create collection"
        title="Create collection"
        aria-expanded={open}
        aria-controls={open ? inputId + "-form" : undefined}
        onClick={() => {
          if (busy.current) return;
          if (open) close(true);
          else setOpen(true);
        }}
      >
        <WorkspaceIcon name="plus" />
      </button>
      {open && (
        <form
          id={inputId + "-form"}
          ref={form}
          className="workspace-popover collection-popover"
          data-workspace-overlay=""
          aria-labelledby={titleId}
          aria-busy={pending}
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy.current || !name.trim()) return;
            busy.current = true;
            setPending(true);
            setError("");
            try {
              await onCreate(name.trim());
              close(true);
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Could not create collection. Try again.",
              );
              input.current?.focus();
            } finally {
              busy.current = false;
              setPending(false);
            }
          }}
        >
          <h2 id={titleId}>New collection</h2>
          <label htmlFor={inputId}>Collection name</label>
          <input
            id={inputId}
            ref={input}
            value={name}
            maxLength={100}
            readOnly={pending}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? inputId + "-error" : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
          />
          {error && (
            <p id={inputId + "-error"} role="alert">
              {error}
            </p>
          )}
          <div className="collection-popover-actions">
            <button
              type="button"
              className="secondary-btn"
              disabled={pending}
              onClick={() => close(true)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-btn"
              disabled={pending || !name.trim()}
            >
              {pending ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
