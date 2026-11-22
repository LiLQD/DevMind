import assert from "node:assert/strict";
import { mock, test } from "node:test";

const models = {
  embedContent() {
    assert.fail("Expected a Gemini stub");
  },
};

mock.module("@google/genai", {
  exports: {
    GoogleGenAI: class {
      models = models;
    },
  },
});
mock.module("../src/config/env.ts", {
  exports: { env: { GEMINI_API_KEY: "test-key" } },
});

const { cosineSimilarity, generateEmbedding, generateQueryEmbedding } =
  await import("../src/services/embedding.service.ts");

for (const [generate, taskType] of [
  [generateEmbedding, "RETRIEVAL_DOCUMENT"],
  [generateQueryEmbedding, "RETRIEVAL_QUERY"],
]) {
  test(`${taskType} requests a 768-dimensional embedding and returns the first vector`, async (t) => {
    const vector = Array(768).fill(0.5);
    const embedContent = t.mock.method(models, "embedContent", async () => ({
      embeddings: [{ values: vector }, { values: [1] }],
    }));

    const result = await generate("sample text");

    assert.deepEqual(result, vector);
    assert.equal(embedContent.mock.callCount(), 1);
    assert.deepEqual(embedContent.mock.calls[0].arguments, [
      {
        model: "gemini-embedding-001",
        contents: "sample text",
        config: { taskType, outputDimensionality: 768 },
      },
    ]);
  });

  test(`${taskType} returns null when Gemini omits the vector`, async (t) => {
    t.mock.method(models, "embedContent", async () => ({
      embeddings: [{}],
    }));

    assert.equal(await generate("sample text"), null);
  });

  test(`${taskType} returns null when Gemini rejects the request`, async (t) => {
    t.mock.method(models, "embedContent", async () => {
      throw new Error("Gemini unavailable");
    });
    t.mock.method(console, "error", () => {});

    assert.equal(await generate("sample text"), null);
  });
}

test("cosine similarity scores parallel and orthogonal vectors", () => {
  assert.equal(cosineSimilarity([2, 0], [3, 0]), 1);
  assert.equal(cosineSimilarity([2, 0], [0, 3]), 0);
});

test("cosine similarity returns zero for missing, mismatched, or zero vectors", () => {
  assert.equal(cosineSimilarity(null, [1]), 0);
  assert.equal(cosineSimilarity([1], undefined), 0);
  assert.equal(cosineSimilarity([1], [1, 0]), 0);
  assert.equal(cosineSimilarity([0], [1]), 0);
});
