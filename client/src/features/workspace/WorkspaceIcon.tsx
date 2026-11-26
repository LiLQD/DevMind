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
