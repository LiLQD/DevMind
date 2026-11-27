import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock, test } from "node:test";
import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import Note from "../src/models/Note.ts";
import Collection from "../src/models/Collection.ts";
import Tag from "../src/models/Tag.ts";
import { getMonthlyUsage } from "../src/services/usage.service.ts";

const uri = process.env.COLLECTION_OWNERSHIP_TEST_MONGODB_URI;

function assertState(row, content, revision, embedding, status) {
  assert.ok(row);
  assert.equal(row.content, content);
  assert.equal(row.contentRevision, revision);
  assert.deepEqual(row.embedding, embedding);
  assert.equal(row.embeddingStatus, status);
}

test(
  "note content revisions protect overlapping writes in MongoDB",
  {
    skip: !uri && !process.env.CI && "Requires disposable MongoDB",
    timeout: 30_000,
  },
  async (suite) => {
    assert.ok(uri, "CI requires COLLECTION_OWNERSHIP_TEST_MONGODB_URI");
    process.env.MONGODB_URI = uri;
    process.env.REDIS_URL = "redis://note-concurrency-test";
    process.env.GEMINI_API_KEY = "note-concurrency-test-key";

    const generateEmbedding = mock.fn(async () => [1, 0]);
    mock.module(
      new URL("../src/services/embedding.service.ts", import.meta.url).href,
      {
        exports: { generateEmbedding, cosineSimilarity: () => 1 },
      },
    );
    const { createNote, updateNote, deleteNote } =
      await import("../src/controllers/note.controller.ts");
    await mongoose.connect(uri, {
      dbName: `devmind_note_race_${randomUUID()}`,
      serverSelectionTimeoutMS: 5_000,
    });
    suite.after(async () => {
      try {
        await mongoose.connection.dropDatabase();
      } finally {
        await mongoose.disconnect();
      }
    });

    function clientFor(userId) {
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.user = { id: userId };
        next();
      });
      app.post("/notes", createNote);
      app.put("/notes/:id", updateNote);
      app.delete("/notes/:id", deleteNote);
      return request(app);
    }

    function fixture(t) {
      generateEmbedding.mock.resetCalls();
      generateEmbedding.mock.mockImplementation(async () => [1, 0]);
      const userId = new mongoose.Types.ObjectId();
      const client = clientFor(userId);
      const create = (content = "A") =>
        client.post("/notes").send({ title: "Fixture", content });
      const edit = (id, changes) => client.put(`/notes/${id}`).send(changes);
      const stored = (id) =>
        Note.collection.findOne({
          _id: new mongoose.Types.ObjectId(id),
          userId,
        });
      const usage = async (expected) => {
        assert.equal(
          (await getMonthlyUsage(userId)).noteEmbeddingRequests,
          expected,
        );
        assert.equal(generateEmbedding.mock.callCount(), expected);
      };

      function hold(content) {
        const entered = Promise.withResolvers();
        const release = Promise.withResolvers();
        t.after(() => release.resolve(null));
        const previous = generateEmbedding.mock.calls.length;
        generateEmbedding.mock.mockImplementationOnce(async (input) => {
          entered.resolve(input);
          return release.promise;
        }, previous);
        return {
          entered: async () => assert.equal(await entered.promise, content),
          finish: release.resolve,
          fail: release.reject,
        };
      }
      return { userId, client, create, edit, stored, usage, hold };
    }

    for (const { name, latest, late } of [
      {
        name: "successful create after successful edit",
        latest: [0, 1],
        late: [1, 0],
      },
      {
        name: "successful create after failed edit",
        latest: null,
        late: [1, 0],
      },
      {
        name: "failed create embedding after successful edit",
        latest: [0, 1],
        late: null,
      },
    ]) {
      await suite.test(name, async (t) => {
        const { userId, create, edit, stored, hold, usage } = fixture(t);
        const gate = hold("A");
        const creating = create()
          .expect(201)
          .then(({ body }) => body);
        void creating.catch(() => {});
        await gate.entered();
        const originalId = await (async () => {
          const inserted = await Note.collection.findOne({ userId });
          assertState(inserted, "A", 1, null, "pending");
          generateEmbedding.mock.mockImplementation(async () => latest);
          await edit(inserted._id, { content: "B" }).expect(200);
          return inserted._id;
        })().finally(() => {
          if (late) gate.finish(late);
          else gate.fail(new Error("Embedding provider unavailable"));
        });
        const response = await creating;
        assert.equal(response.content, "B");
        assert.equal(response.embeddingStatus, latest ? "success" : "failed");
        assert.equal(Object.hasOwn(response, "contentRevision"), false);
        assert.equal(response._id, String(originalId));
        assertState(
          await stored(response._id),
          "B",
          2,
          latest,
          latest ? "success" : "failed",
        );
        await usage(2);
      });
    }

    for (const { name, finalContent, latest } of [
      {
        name: "reversed embedding completion order",
        finalContent: "C",
        latest: [0, 1],
      },
      { name: "failed newer edit", finalContent: "C", latest: null },
      {
        name: "content changes from A to B and back to A",
        finalContent: "A",
        latest: [0, 1],
      },
    ]) {
      await suite.test(name, async (t) => {
        const { create, edit, stored, hold, usage } = fixture(t);
        const {
          body: { _id },
        } = await create().expect(201);
        const gate = hold("B");
        const editing = edit(_id, { content: "B" })
          .expect(200)
          .then(({ body }) => body);
        void editing.catch(() => {});
        await gate.entered();
        const before = await (async () => {
          assertState(await stored(_id), "B", 2, [1, 0], "pending");
          generateEmbedding.mock.mockImplementation(async () => latest);
          await edit(_id, { content: finalContent }).expect(200);
          return stored(_id);
        })().finally(() => gate.finish([0.6, 0.8]));
        assert.equal((await editing).content, finalContent);
        const after = await stored(_id);
        assertState(
          after,
          finalContent,
          3,
          latest ?? [1, 0],
          latest ? "success" : "failed",
        );
        assert.deepEqual(after.updatedAt, before.updatedAt);
        await usage(3);
      });
    }

    await suite.test(
      "a database failure leaves committed content pending",
      async (t) => {
        const { create, edit, stored, usage } = fixture(t);
        const {
          body: { _id },
        } = await create().expect(201);
        const failure = new Error("Embedding write unavailable");
        const write = t.mock.method(Note, "updateOne", async () => {
          throw failure;
        });
        await edit(_id, { content: "B" }).expect(500);
        assert.equal(write.mock.callCount(), 1);
        assertState(await stored(_id), "B", 2, [1, 0], "pending");
        await usage(2);
      },
    );

    await suite.test(
      "metadata writes survive while embedding is running",
      async (t) => {
        const { userId, create, edit, stored, hold, usage } = fixture(t);
        const {
          body: { _id },
        } = await create().expect(201);
        const collection = await Collection.create({
          userId,
          name: "Owned collection",
        });
        const gate = hold("B");
        const editing = edit(_id, { content: "B" })
          .expect(200)
          .then(({ body }) => body);
        void editing.catch(() => {});
        await gate.entered();
        const before = await (async () => {
          await Promise.all([
            edit(_id, { title: "New title" }).expect(200),
            edit(_id, { tags: ["New tag"] }).expect(200),
            edit(_id, { collections: [collection.id] }).expect(200),
          ]);
          return stored(_id);
        })().finally(() => gate.finish([0, 1]));
        const response = await editing;
        const after = await stored(_id);
        assertState(after, "B", 2, [0, 1], "success");
        assert.equal(after.title, "New title");
        assert.deepEqual(after.collections, [collection._id]);
        assert.deepEqual(after.tags, [
          (await Tag.findOne({ userId, name: "New tag" }).orFail())._id,
        ]);
        assert.equal(response.tags[0].name, "New tag");
        assert.deepEqual(after.updatedAt, before.updatedAt);
        await usage(2);
      },
    );

    for (const action of ["create", "edit"]) {
      await suite.test(`deletion during ${action} embedding`, async (t) => {
        const { userId, client, create, edit, stored, hold, usage } =
          fixture(t);
        const isCreate = action === "create";
        const existing = isCreate ? null : (await create().expect(201)).body;
        const gate = hold(isCreate ? "A" : "B");
        const saving = (
          isCreate ? create() : edit(existing._id, { content: "B" })
        )
          .expect(isCreate ? 201 : 404)
          .then(({ body }) => body);
        void saving.catch(() => {});
        await gate.entered();
        const { _id } = await (async () => {
          const note = await Note.collection.findOne({ userId });
          await client.delete(`/notes/${note._id}`).expect(200);
          return note;
        })().finally(() => gate.finish([0, 1]));
        const body = await saving;
        if (isCreate) {
          assert.equal(body._id, String(_id));
          assert.equal(body.content, "A");
          assert.equal(body.embeddingStatus, "pending");
        }
        assert.equal(await stored(_id), null);
        await usage(isCreate ? 1 : 2);
      });
    }

    await suite.test(
      "legacy notes, identical content and account isolation",
      async (t) => {
        const { userId, edit, stored, usage } = fixture(t);
        const { insertedId } = await Note.collection.insertOne({
          userId,
          title: "Legacy",
          content: "A",
          embedding: [1, 0],
          embeddingStatus: "success",
        });
        const other = clientFor(new mongoose.Types.ObjectId());
        await other
          .put(`/notes/${insertedId}`)
          .send({ content: "Private write" })
          .expect(403);
        await edit(insertedId, { content: "A", title: "Renamed" }).expect(200);
        assertState(
          await stored(insertedId),
          "A",
          undefined,
          [1, 0],
          "success",
        );
        await usage(0);
        generateEmbedding.mock.mockImplementation(async () => [0, 1]);
        await edit(insertedId, { content: "B" }).expect(200);
        assertState(await stored(insertedId), "B", 1, [0, 1], "success");
        await usage(1);
      },
    );
  },
);
