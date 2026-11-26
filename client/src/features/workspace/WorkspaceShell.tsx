import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import WorkspaceIcon from "./WorkspaceIcon";

type Panels = { navigation: boolean; browse: boolean; details: boolean | null };
const storageKey = "devmind-workspace-layout";
const defaultPanels: Panels = { navigation: true, browse: true, details: null };
export const mobileWorkspace = "(max-width: 800px)";

function readPanels(): Panels {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (
      value &&
      typeof value.navigation === "boolean" &&
      typeof value.browse === "boolean" &&
      (value.details === null || typeof value.details === "boolean")
    )
      return value;
  } catch {
    // Layout remains usable if storage is unavailable.
  }
  return defaultPanels;
}

const FocusContext = createContext<{
  focused: boolean;
  toggle: () => void;
} | null>(null);

export function FocusControl() {
  const context = useContext(FocusContext);
  if (!context) return null;
  return (
    <button
      type="button"
      className="secondary-btn focus-control"
      aria-pressed={context.focused}
      onClick={context.toggle}
    >
      <WorkspaceIcon name="focus" />
      {context.focused ? "Exit focus mode" : "Focus mode"}
    </button>
  );
}

export default function WorkspaceShell({
  navigation,
  browse,
  details,
  canFocus,
  showDetail,
  showBrowse,
  children,
}: {
  navigation: ReactNode;
  browse: ReactNode;
  details: ReactNode;
  canFocus: boolean;
  showDetail: boolean;
  showBrowse: () => void;
  children: ReactNode;
}) {
  const [panels, setPanels] = useState(readPanels);
  const [wide, setWide] = useState(
    () => matchMedia("(min-width: 1400px)").matches,
  );
  const [mobile, setMobile] = useState(
    () => matchMedia(mobileWorkspace).matches,
  );
  const [drawer, setDrawer] = useState(false);
  const [mobileDetails, setMobileDetails] = useState(false);
  const [focused, setFocused] = useState(false);
  const focusActive = focused && canFocus;
  const drawerOpen = mobile && drawer && !focusActive;
  const detailsVisible = mobile
    ? mobileDetails && showDetail
    : (panels.details ?? wide);
  const detailsOverlay =
    Boolean(details) && detailsVisible && !wide && !focusActive;
  const root = useRef<HTMLElement>(null);
  const navToggle = useRef<HTMLButtonElement>(null);
  const detailToggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const mq = matchMedia(mobileWorkspace);
    const wq = matchMedia("(min-width: 1400px)");
    const update = () => {
      setMobile(mq.matches);
      setWide(wq.matches);
    };
    mq.addEventListener("change", update);
    wq.addEventListener("change", update);
    return () => {
      mq.removeEventListener("change", update);
      wq.removeEventListener("change", update);
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(panels));
    } catch {
      // Layout preferences are optional.
    }
  }, [panels]);

  const closeDrawer = () => {
    setDrawer(false);
    requestAnimationFrame(() => navToggle.current?.focus());
  };

  useEffect(() => {
    if (!focusActive && !drawerOpen && !detailsOverlay) return;
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        document.querySelector(
          "dialog[open], [data-workspace-overlay], .confirm-overlay",
        )
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (drawerOpen) {
        setDrawer(false);
        requestAnimationFrame(() => navToggle.current?.focus());
      } else if (detailsOverlay) {
        if (mobile) setMobileDetails(false);
        else setPanels((current) => ({ ...current, details: false }));
        detailToggle.current?.focus();
      } else {
        setFocused(false);
        requestAnimationFrame(() =>
          root.current
            ?.querySelector<HTMLButtonElement>(".focus-control")
            ?.focus(),
        );
      }
    };
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, [focusActive, drawerOpen, detailsOverlay, mobile]);

  return (
    <FocusContext.Provider
      value={{ focused: focusActive, toggle: () => setFocused(!focusActive) }}
    >
      <main
        ref={root}
        aria-label="Notes workspace"
        className={`workspace workspace-redesign ${showDetail ? "workspace-show-detail" : ""}`}
        data-nav={panels.navigation}
        data-browse={panels.browse}
        data-details={Boolean(details) && detailsVisible}
        data-focus={focusActive}
        data-drawer={drawerOpen}
      >
        <div
          className="workspace-navigation"
          id="workspace-navigation"
          role={drawerOpen ? "dialog" : undefined}
          aria-label={drawerOpen ? "Navigation drawer" : undefined}
          aria-modal={drawerOpen ? true : undefined}
          onKeyDown={(event) => {
            if (
              !drawerOpen ||
              event.key !== "Tab" ||
              document.querySelector("dialog[open]")
            )
              return;
            const tabbable = [
              ...event.currentTarget.querySelectorAll<HTMLElement>(
                "button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]",
              ),
            ].filter((element) => element.getClientRects().length);
            const target = event.shiftKey ? tabbable.at(-1) : tabbable[0];
            const edge = event.shiftKey ? tabbable[0] : tabbable.at(-1);
            if (event.target === edge) {
              event.preventDefault();
              target?.focus();
            }
          }}
          onClick={(event) => {
            if (
              mobile &&
              event.target instanceof Element &&
              event.target.closest("[data-close-drawer]")
            )
              closeDrawer();
          }}
        >
          {navigation}
        </div>
        {drawerOpen && (
          <button
            type="button"
            className="workspace-shade"
            aria-label="Close navigation"
            tabIndex={-1}
            onClick={closeDrawer}
          />
        )}
        <div
          className="workspace-browse"
          id="workspace-browse"
          inert={drawerOpen}
        >
          {browse}
        </div>
        <div className="workspace-center" inert={drawerOpen}>
          {!focusActive && (
            <div
              className="workspace-layout-controls"
              aria-label="Workspace layout"
            >
              <button
                ref={navToggle}
                type="button"
                className="secondary-btn layout-toggle"
                aria-controls="workspace-navigation"
                aria-expanded={mobile ? drawer : panels.navigation}
                aria-label={
                  (mobile ? drawer : panels.navigation)
                    ? "Collapse navigation"
                    : "Show navigation"
                }
                onClick={() => {
                  if (mobile) {
                    if (drawer) closeDrawer();
                    else {
                      setDrawer(true);
                      requestAnimationFrame(() =>
                        root.current
                          ?.querySelector<HTMLButtonElement>(
                            ".workspace-navigation button",
                          )
                          ?.focus(),
                      );
                    }
                  } else
                    setPanels({ ...panels, navigation: !panels.navigation });
                }}
              >
                <WorkspaceIcon name="navigation" />
              </button>
              <button
                type="button"
                className="secondary-btn layout-toggle browse-toggle"
                aria-controls="workspace-browse"
                aria-expanded={mobile ? !showDetail : panels.browse}
                aria-label={
                  mobile
                    ? "Back to notes"
                    : panels.browse
                      ? "Collapse note list"
                      : "Show note list"
                }
                onClick={() =>
                  mobile
                    ? showBrowse()
                    : setPanels({ ...panels, browse: !panels.browse })
                }
              >
                <WorkspaceIcon name="list" />
              </button>
              {details && (
                <button
                  ref={detailToggle}
                  type="button"
                  className="secondary-btn layout-toggle details-toggle"
                  aria-controls="workspace-details"
                  aria-expanded={detailsVisible}
                  aria-label={
                    detailsVisible
                      ? "Collapse note details"
                      : "Show note details"
                  }
                  onClick={() => {
                    if (mobile) setMobileDetails(!mobileDetails);
                    else setPanels({ ...panels, details: !detailsVisible });
                  }}
                >
                  <WorkspaceIcon name="details" />
                </button>
              )}
            </div>
          )}
          {children}
        </div>
        <div
          className="workspace-details"
          id="workspace-details"
          inert={drawerOpen}
        >
          {details}
        </div>
      </main>
    </FocusContext.Provider>
  );
}
