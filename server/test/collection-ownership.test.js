import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock, test } from "node:test";
import mongoose from "mongoose";
import request from "supertest";
import {
  configureTestCookies,
  sessionHeaders,
  submitCredentials,
} from "../test-support/cookie-fixture.js";

const uri = process.env.COLLECTION_OWNERSHIP_TEST_MONGODB_URI;
const moduleUrl = (path) => new URL(`../src/${path}`, import.meta.url).href;
const notesPath = "/api/notes";
const searchPath = `${notesPath}/search`;
const validationError = { message: "Invalid note collection references." };

test(
  "note collection references are scoped to the authenticated account",
  {
    skip:
      !uri &&
      !process.env.CI &&
      "Set COLLECTION_OWNERSHIP_TEST_MONGODB_URI to run against disposable MongoDB",
  },
  async (t) => {
    assert.ok(uri, "CI requires COLLECTION_OWNERSHIP_TEST_MONGODB_URI");
    process.env.MONGODB_URI = uri;
    process.env.REDIS_URL = "redis://collection-ownership-test";
    configureTestCookies();
    process.env.GEMINI_API_KEY = "collection-ownership-test-key";

    mock.module(moduleUrl("config/redis.ts"), {
      exports: { default: { call: async () => null, on: () => {} } },
    });
    mock.module("rate-limit-redis", {
      exports: {
        default: class RedisStore {
          init() {}

          async increment() {
            return { totalHits: 1, resetTime: new Date(Date.now() + 60_000) };
          }

          async decrement() {}
          async resetKey() {}
        },
      },
    });
    const generateEmbedding = mock.fn(async () => [1, 0]);
    const { cosineSimilarity } =
      await import("../src/services/embedding.service.ts");
    mock.module(moduleUrl("services/embedding.service.ts"), {
      exports: {
        cosineSimilarity,
        generateEmbedding,
        generateQueryEmbedding: async () => [1, 0],
      },
    });

    const { default: app } = await import("../src/app.ts");
    const { default: Collection } = await import("../src/models/Collection.ts");
    const { default: MonthlyUsage } =
      await import("../src/models/MonthlyUsage.ts");
    const { default: Note } = await import("../src/models/Note.ts");
    const { default: Tag } = await import("../src/models/Tag.ts");

    await mongoose.connect(uri, {
      dbName: `devmind_ownership_${randomUUID()}`,
      serverSelectionTimeoutMS: 5_000,
    });
    t.after(async () => {
      try {
        await mongoose.connection.dropDatabase();
      } finally {
        await mongoose.disconnect();
      }
    });

    const client = request(app);
    async function register(email) {
      const response = await submitCredentials(
        client,
        "register",
        { email, password: "test-password", name: "Ownership Test" },
        201,
      );
      return {
        id: new mongoose.Types.ObjectId(response.body.user.id),
        headers: await sessionHeaders(client, response),
      };
    }
    const owner = await register("owner@example.com");
    const other = await register("other@example.com");
    const [first, second, foreign] = await Collection.create([
      {
        userId: owner.id,
        name: "First collection",
        description: "Owned metadata",
      },
      { userId: owner.id, name: "Second collection" },
      {
        userId: other.id,
        name: "Private collection",
        description: "Private metadata",
      },
    ]);
    const ownedIds = [first.id, second.id];
    const payload = {
      title: "Ownership fixture",
      content: "isolation boundary",
    };
    const authorized = (req) => req.set(owner.headers);

    function assertCollections(note, expectedIds) {
      assert.deepEqual(
        note.collections.map(({ _id }) => _id),
        expectedIds,
      );
      assert.equal(Object.hasOwn(note, "collection"), false);
      const serialized = JSON.stringify(note);
      assert.equal(serialized.includes(foreign.id), false);
      assert.equal(serialized.includes(foreign.name), false);
      assert.equal(serialized.includes(foreign.description), false);
    }

    const { body: created } = await authorized(client.post(notesPath))
      .send({ ...payload, collections: ownedIds })
      .expect(201);
    const notePath = `${notesPath}/${created._id}`;

    await t.test(
      "preserves valid owned order, omitted updates, and explicit clearing",
      async () => {
        assertCollections(created, ownedIds);
        assert.equal(created.collections[0].description, first.description);
        const { body: updated } = await authorized(client.put(notePath))
          .send({ collections: [second.id, first.id] })
          .expect(200);
        assertCollections(updated, [second.id, first.id]);
        const { body: omitted } = await authorized(client.put(notePath))
          .send({ title: payload.title })
          .expect(200);
        assertCollections(omitted, [second.id, first.id]);
        const { body: cleared } = await authorized(client.put(notePath))
          .send({ collections: [] })
          .expect(200);
        assertCollections(cleared, []);
        const { body: restored } = await authorized(client.put(notePath))
          .send({ collections: ownedIds })
          .expect(200);
        assertCollections(restored, ownedIds);
      },
    );

    await t.test(
      "rejects malformed, missing, and foreign references before any write side effects",
      async () => {
        const before = await Note.findById(created._id).lean();
        const notesBefore = await Note.countDocuments({ userId: owner.id });
        const usageBefore = await MonthlyUsage.find({
          accountId: owner.id,
        }).lean();
        const embeddingCalls = generateEmbedding.mock.callCount();
        const invalid = [
          { collections: null },
          { collections: first.id },
          { collections: [null] },
          { collections: ["not-an-object-id"] },
          { collections: [{ _id: first.id }] },
          { collections: [new mongoose.Types.ObjectId().toString()] },
          { collections: [foreign.id] },
          { collections: [first.id, foreign.id] },
          { collection: foreign.id },
        ];

        for (const fields of invalid) {
          const input = {
            title: "Rejected write",
            content: "Do not persist this content",
            tags: ["should-not-be-created"],
            ...fields,
          };
          await authorized(client.post(notesPath))
            .send(input)
            .expect(400, validationError);
          await authorized(client.put(notePath))
            .send(input)
            .expect(400, validationError);
        }

        assert.equal(await Tag.countDocuments({ userId: owner.id }), 0);
        assert.equal(
          await Note.countDocuments({ userId: owner.id }),
          notesBefore,
        );
        assert.deepEqual(await Note.findById(created._id).lean(), before);
        assert.deepEqual(
          await MonthlyUsage.find({ accountId: owner.id }).lean(),
          usageBefore,
        );
        assert.equal(generateEmbedding.mock.callCount(), embeddingCalls);
      },
    );

    await t.test(
      "filters legacy references from all note responses without changing the database",
      async () => {
        const legacy = {
          _id: new mongoose.Types.ObjectId(),
          userId: owner.id,
          title: "Legacy ownership fixture",
          content: "isolation boundary",
          collections: [first._id, foreign._id, second._id],
          collection: {
            _id: foreign._id,
            name: foreign.name,
            description: foreign.description,
          },
          embeddingStatus: "success",
          embedding: [1, 0],
        };
        await Note.collection.insertOne(legacy);
        const legacyId = legacy._id.toString();
        const legacyPath = `${notesPath}/${legacyId}`;
        const pickLegacy = (notes) =>
          notes.find((note) => note._id === legacyId);

        const { body: updated } = await authorized(client.put(legacyPath))
          .send({ title: legacy.title })
          .expect(200);
        assertCollections(updated, ownedIds);
        const { body: listed } = await authorized(client.get(notesPath)).expect(
          200,
        );
        assertCollections(pickLegacy(listed), ownedIds);
        await authorized(
          client.get(notesPath).query({ collectionId: foreign.id }),
        ).expect(200, []);
        const { body: ownedFilter } = await authorized(
          client.get(notesPath).query({ collectionId: first.id }),
        ).expect(200);
        assertCollections(pickLegacy(ownedFilter), ownedIds);

        const { body: detail } = await authorized(
          client.get(legacyPath),
        ).expect(200);
        assertCollections(detail, ownedIds);
        const { body: related } = await authorized(client.get(notePath)).expect(
          200,
        );
        assertCollections(pickLegacy(related.relatedNotes), ownedIds);

        for (const mode of ["exact", "semantic"]) {
          const { body } = await authorized(client.post(searchPath))
            .send({ query: "isolation boundary", mode })
            .expect(200);
          assertCollections(pickLegacy(body.results), ownedIds);
        }

        const persisted = await Note.collection.findOne({ _id: legacy._id });
        assert.deepEqual(persisted.collections, legacy.collections);
        assert.deepEqual(persisted.collection, legacy.collection);
      },
    );
  },
);
