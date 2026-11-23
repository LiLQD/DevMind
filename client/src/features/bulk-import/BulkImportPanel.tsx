import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { fitsNoteRequest, readMarkdownFile } from "../../markdownFile";
import { maxBulkFiles, readImportResults } from "./api";
import type { ImportNote, ImportResult } from "./api";

type ImportRow =
  | { key: string; filename: string; note: ImportNote; result?: ImportResult }
  | { key: string; filename: string; error: string };

function describeRow(row: ImportRow) {
  if ("error" in row) return row.error;
  if (!row.result) return "Ready";
  if (row.result.status === "saved") {
    switch (row.result.embeddingStatus) {
      case "pending":
        return "Saved · embedding pending";
      case "failed":
        return "Saved · embedding failed";
      case "success":
        return "Saved";
    }
  }
  switch (row.result.code) {
    case "SAVE_FAILED":
      return "Save failed · retry available";
    case "INVALID_NOTE":
      return "Rejected · invalid note";
    case "IMPORT_KEY_CONFLICT":
      return "Rejected · import key already in use";
  }
}

async function prepareRow(file: File): Promise<ImportRow> {
  const key = crypto.randomUUID();
  try {
    const { title, content } = await readMarkdownFile(file);
    return {
      key,
      filename: file.name,
      note: { key, title, content: content.trim() },
    };
  } catch (error) {
    return {
      key,
      filename: file.name,
      error:
        error instanceof Error ? error.message : "Could not read this file.",
    };
  }
}

export default function BulkImportPanel({
  apiRequest,
  onSaved,
}: {
  apiRequest: <T>(endpoint: string, options?: RequestInit) => Promise<T>;
  onSaved: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [working, setWorking] = useState<"reading" | "saving" | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const pending = rows.flatMap((row) =>
    "note" in row &&
    (!row.result ||
      (row.result.status === "failed" && row.result.code === "SAVE_FAILED"))
      ? [row.note]
      : [],
  );

  const selectFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!files.length || working || rows.length) return;
    if (files.length > maxBulkFiles) {
      setError(`Choose up to ${maxBulkFiles} Markdown files at a time.`);
      return;
    }
    setError("");
    setWorking("reading");
    try {
      setRows(await Promise.all(files.map(prepareRow)));
    } finally {
      setWorking(null);
    }
  };

  const submit = async () => {
    if (!pending.length || working) return;
    const body = JSON.stringify({ notes: pending });
    if (!fitsNoteRequest(body)) {
      setError(
        "This batch exceeds the 1 MiB request limit. Choose fewer or smaller files.",
      );
      return;
    }

    setError("");
    setWorking("saving");
    setAttempted(true);
    try {
      const response = await apiRequest<unknown>("/notes/import", {
        method: "POST",
        body,
      });
      const results = readImportResults(response, pending);
      setRows((previous) =>
        previous.map((row) => {
          const result = results.get(row.key);
          return "note" in row && result ? { ...row, result } : row;
        }),
      );
      if (
        Array.from(results.values()).some((result) => result.status === "saved")
      ) {
        onSaved();
      }
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Bulk import failed.",
      );
    } finally {
      setWorking(null);
    }
  };

  return (
    <>
      <button
        type="button"
        className="topbar-button"
        onClick={() => dialogRef.current?.showModal()}
      >
        Bulk import
      </button>
      <dialog
        ref={dialogRef}
        className="plan-dialog bulk-import-dialog"
        aria-labelledby="bulk-import-title"
        onCancel={(event) => {
          if (working) event.preventDefault();
        }}
      >
        <header className="plan-dialog-header">
          <h2 id="bulk-import-title">Bulk Markdown import</h2>
          <form method="dialog">
            <button
              type="submit"
              className="secondary-btn"
              disabled={Boolean(working)}
            >
              Close
            </button>
          </form>
        </header>
        <p>
          Select up to {maxBulkFiles} .md files and review them before
          importing.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".md"
          multiple
          hidden
          onChange={(event) => void selectFiles(event)}
        />
        {rows.length === 0 ? (
          <button
            type="button"
            className="secondary-btn"
            disabled={Boolean(working)}
            onClick={() => inputRef.current?.click()}
          >
            Choose Markdown files
          </button>
        ) : (
          <>
            <ul className="bulk-import-files" aria-label="Import results">
              {rows.map((row) => (
                <li key={row.key}>
                  <strong>{row.filename}</strong>
                  <p>{describeRow(row)}</p>
                  {"note" in row && !row.result && (
                    <details>
                      <summary>Review note</summary>
                      <p>{row.note.title}</p>
                      <pre>{row.note.content}</pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
            <div className="bulk-import-actions">
              {pending.length > 0 && (
                <button
                  type="button"
                  className="primary-btn"
                  disabled={Boolean(working)}
                  onClick={() => void submit()}
                >
                  {attempted ? "Retry remaining files" : "Import notes"}
                </button>
              )}
              <button
                type="button"
                className="secondary-btn"
                disabled={Boolean(working)}
                onClick={() => {
                  setRows([]);
                  setAttempted(false);
                  setError("");
                }}
              >
                Clear selection
              </button>
            </div>
          </>
        )}
        <div role="status">
          {working === "reading" && "Reading Markdown files…"}
          {working === "saving" && "Importing notes…"}
          {!working &&
            rows.some(
              (row) => "result" in row && row.result?.status === "saved",
            ) &&
            `${rows.filter((row) => "result" in row && row.result?.status === "saved").length} notes saved.`}
        </div>
        {error && <p role="alert">{error}</p>}
      </dialog>
    </>
  );
}
