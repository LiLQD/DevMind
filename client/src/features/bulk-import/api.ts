export const maxBulkFiles = 5;

export type ImportNote = { key: string; title: string; content: string };

type Saved = {
  status: "saved";
  embeddingStatus: "pending" | "success" | "failed";
};
type Failed = {
  status: "failed";
  code: "SAVE_FAILED" | "INVALID_NOTE" | "IMPORT_KEY_CONFLICT";
};
export type ImportResult = Saved | Failed;

export function readImportResults(response: unknown, notes: ImportNote[]) {
  if (
    typeof response !== "object" ||
    response === null ||
    !("results" in response) ||
    !Array.isArray(response.results) ||
    response.results.length !== notes.length
  ) {
    throw new Error("Could not confirm the import results. Retry this batch.");
  }

  const results = new Map<string, ImportResult>();
  const rawResults: unknown[] = response.results;
  for (const [index, result] of rawResults.entries()) {
    const { key } = notes[index];
    if (
      typeof result === "object" &&
      result !== null &&
      "index" in result &&
      result.index === index &&
      "status" in result
    ) {
      if (
        result.status === "saved" &&
        "key" in result &&
        result.key === key &&
        "embeddingStatus" in result &&
        (result.embeddingStatus === "pending" ||
          result.embeddingStatus === "success" ||
          result.embeddingStatus === "failed")
      ) {
        results.set(key, {
          status: "saved",
          embeddingStatus: result.embeddingStatus,
        });
        continue;
      }
      if (
        result.status === "failed" &&
        "code" in result &&
        (("key" in result &&
          result.key === key &&
          (result.code === "SAVE_FAILED" ||
            result.code === "IMPORT_KEY_CONFLICT")) ||
          result.code === "INVALID_NOTE")
      ) {
        results.set(key, { status: "failed", code: result.code });
        continue;
      }
    }
    throw new Error("Could not confirm the import results. Retry this batch.");
  }
  return results;
}
