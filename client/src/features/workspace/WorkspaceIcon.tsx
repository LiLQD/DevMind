const paths = {
  brand: "m2 8 10-6 10 6-10 6L2 8Zm0 4 10 6 10-6M2 16l10 6 10-6",
  note: "M6 3h8l4 4v14H6V3Zm7 0v5h5M9 12h6m-6 4h6",
  star: "m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4-4.6-4.5 6.4-.9L12 3Z",
  import: "M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5",
  collection: "m3 8 9-5 9 5-9 5-9-5Zm0 4 9 5 9-5M3 16l9 5 9-5",
  archive: "M4 3h16v5H4V3Zm1 5v13h14V8m-10 4h6",
  navigation: "M3 5h18v14H3V5Zm6 0v14",
  list: "M5 6h14M5 12h14M5 18h14",
  details: "M3 5h18v14H3V5Zm12 0v14",
  edit: "m4 16 11-11 4 4L8 20H4v-4Zm9-9 4 4",
  focus: "M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4",
  search: "M15 15l5 5m-3-9a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z",
  plus: "M12 5v14M5 12h14",
  back: "m11 5-7 7 7 7M4 12h16",
  chevron: "m9 6 6 6-6 6",
  down: "m6 9 6 6 6-6",
  sun: "M12 4V2m0 20v-2M4 12H2m20 0h-2M6 6 4 4m16 16-2-2M6 18l-2 2M20 4l-2 2m-1 8a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z",
  moon: "M20.5 14a8.5 8.5 0 0 1-10.5-10.5A8.5 8.5 0 1 0 20.5 14Z",
  check: "m5 12 4 4 10-10",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1",
  globe:
    "M3 12h18M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c5 5 5 13 0 18m0-18c-5 5-5 13 0 18",
  help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 6a3 3 0 1 1 4 3c-1 .4-1 1-1 2m0 3h.01",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 8v5m0-8h.01",
  plan: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 13V8m-3 3 3-3 3 3",
  logout: "M10 4H4v16h6m3-12 4 4-4 4m4-4H8m12-4v8",
} as const;

export type WorkspaceIconName = keyof typeof paths;

export default function WorkspaceIcon({ name }: { name: WorkspaceIconName }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
