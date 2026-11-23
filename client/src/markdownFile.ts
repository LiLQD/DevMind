// Express caps the JSON request body at 1 MiB.
export const maxNoteRequestBytes = 1024 * 1024;

export function fitsNoteRequest(body: string) {
  return new TextEncoder().encode(body).byteLength <= maxNoteRequestBytes;
}

export async function readMarkdownFile(file: File) {
  if (!/\.md$/i.test(file.name)) throw new Error("Choose a .md Markdown file.");
  if (file.size > maxNoteRequestBytes) {
    throw new Error("This file exceeds the 1 MiB note request limit.");
  }

  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
  } catch {
    throw new Error("Could not read this file as UTF-8 Markdown.");
  }
  if (!content.trim()) throw new Error("This Markdown file is empty.");
  if (content.includes("\0"))
    throw new Error("Choose a UTF-8 Markdown text file.");

  const title =
    file.name.slice(0, -3).replace(/\s+/g, " ").trim().slice(0, 200) ||
    "Untitled note";
  return { title, content };
}
