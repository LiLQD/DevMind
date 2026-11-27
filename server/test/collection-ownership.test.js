import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mock, test } from "node:test";
import mongoose from "mongoose";
import request from "supertest";
import {
  configureTestCookies,
  sessionHeaders,
  testOrigin,
  submitCredentials,
} from "../test-support/cookie-fixture.js";

const uri = process.env.COLLECTION_OWNERSHIP_TEST_MONGODB_URI;
const moduleUrl = (path) => new URL(`../src/${path}`, import.meta.url).href;
const notesPath = "/api/notes";
const searchPath = `${notesPath}/search`;
const validationError = { message: "Invalid note collection references." };

test(
  "note metadata ownership and account-scoped tag migration use real MongoDB indexes",
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
    const { ThinkingLevel } = await import("@google/genai");
    mock.module("@google/genai", {
      exports: {
        ThinkingLevel,
        GoogleGenAI: class {
          models = {
            generateContent: async () => ({
              text: JSON.stringify({
                tags: ["redis", "lua"],
                collectionIndex: null,
              }),
            }),
          };
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

    const { default: Subscription } =
      await import("../src/models/Subscription.ts");
    const { migrateAccountScopedTagIndex } =
      await import("../src/migrations/account-scoped-tag-index.ts");

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
        const listedLegacy = pickLegacy(listed);
        assertCollections(listedLegacy, ownedIds);
        assert.equal(Object.hasOwn(listedLegacy, "embedding"), false);
        assert.equal(listedLegacy.content, legacy.content);
        assert.equal(listedLegacy.embeddingStatus, "success");
        await authorized(
          client.get(notesPath).query({ collectionId: foreign.id }),
        ).expect(200, []);
        const { body: ownedFilter } = await authorized(
          client.get(notesPath).query({ collectionId: first.id }),
        ).expect(200);
        const filteredLegacy = pickLegacy(ownedFilter);
        assertCollections(filteredLegacy, ownedIds);
        assert.equal(Object.hasOwn(filteredLegacy, "embedding"), false);

        const { body: detail } = await authorized(
          client.get(legacyPath),
        ).expect(200);
        assertCollections(detail, ownedIds);
        assert.deepEqual(detail.embedding, legacy.embedding);
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
    const tagsPath = "/api/tags";
    const asOther = (req) => req.set(other.headers);
    const createTag = (authorize, name) =>
      authorize(client.post(tagsPath)).send({ name });

    await t.test(
      "migrates only the obsolete index and preserves stored note references",
      async () => {
        await Tag.init();
        const mongoTags = mongoose.connection.db.collection("tags");
        await mongoTags.createIndex({ name: 1 }, { unique: true });
        await mongoTags.createIndex({ createdAt: 1 });
        await mongoTags.dropIndex("userId_1_name_1");
        const {
          body: { tag: redis },
        } = await createTag(authorized, " redis ").expect(201);
        await Note.collection.updateOne(
          { _id: new mongoose.Types.ObjectId(created._id) },
          {
            $set: { tags: [new mongoose.Types.ObjectId(redis._id)] },
          },
        );
        const beforeTags = await mongoTags.find().toArray();
        const beforeNote = await Note.findById(created._id).lean();

        // A conflicting index must leave the legacy guard in place.
        await mongoTags.createIndex({ userId: 1, name: 1 });
        await assert.rejects(
          migrateAccountScopedTagIndex(mongoTags),
          (error) =>
            error instanceof mongoose.mongo.MongoServerError &&
            ["IndexOptionsConflict", "IndexKeySpecsConflict"].includes(
              error.codeName,
            ),
        );
        assert.ok(
          (await mongoTags.indexes()).some(
            ({ name, unique }) => name === "name_1" && unique,
          ),
        );
        await mongoTags.dropIndex("userId_1_name_1");

        assert.equal(
          await migrateAccountScopedTagIndex(mongoTags),
          "removed legacy tag index",
        );
        assert.equal(
          await migrateAccountScopedTagIndex(mongoTags),
          "already migrated",
        );
        const indexes = await mongoTags.indexes();
        assert.ok(
          indexes.some(
            ({ key, unique }) => key.userId === 1 && key.name === 1 && unique,
          ),
        );
        assert.deepEqual(indexes.map(({ name }) => name).toSorted(), [
          "_id_",
          "createdAt_1",
          "userId_1_name_1",
        ]);
        assert.deepEqual(await mongoTags.find().toArray(), beforeTags);
        assert.deepEqual(await Note.findById(created._id).lean(), beforeNote);
        const { body } = await authorized(client.get(notePath)).expect(200);
        assert.deepEqual(
          body.tags.map(({ _id }) => _id),
          [redis._id],
        );
      },
    );

    await t.test(
      "creates independent shared names and resolves concurrent writes within one account",
      async () => {
        const {
          body: { tag: otherRedis },
        } = await createTag(asOther, "redis").expect(201);
        const ownedRedis = await Tag.findOne({
          userId: owner.id,
          name: "redis",
        }).orFail();
        assert.notEqual(ownedRedis.id, otherRedis._id);
        const { body: ownerNote } = await authorized(client.post(notesPath))
          .send({ ...payload, title: "Owned Redis", tags: ["redis"] })
          .expect(201);
        assert.equal(ownerNote.tags[0]._id, ownedRedis.id);
        await createTag(authorized, " redis ").expect(409, {
          message: "Tag already exists.",
        });

        const direct = await Promise.all(
          Array.from({ length: 6 }, () => createTag(authorized, "race")),
        );
        assert.deepEqual(
          direct.map(({ status }) => status).toSorted(),
          [201, 409, 409, 409, 409, 409],
        );
        const concurrent = await Promise.all(
          Array.from({ length: 6 }, (_, index) =>
            asOther(client.post(notesPath))
              .send({
                ...payload,
                title: `Tag race ${index}`,
                tags: [" redis ", "redis", "race"],
              })
              .expect(201),
          ),
        );
        const otherRace = await Tag.findOne({
          userId: other.id,
          name: "race",
        }).orFail();
        for (const { body } of concurrent) {
          assert.deepEqual(
            body.tags.map(({ _id }) => _id),
            [otherRedis._id, otherRace.id],
          );
        }
        for (const userId of [owner.id, other.id]) {
          assert.equal(await Tag.countDocuments({ userId, name: "redis" }), 1);
          assert.equal(await Tag.countDocuments({ userId, name: "race" }), 1);
        }
      },
    );

    await t.test(
      "saves accepted AI suggestions on create and edit and isolates legacy references",
      async () => {
        const {
          body: { tag: ownerLua },
        } = await createTag(authorized, "lua").expect(201);
        const { body: suggestions } = await asOther(
          client.post(`${notesPath}/suggestions`),
        )
          .send({
            title: "Redis TTL",
            content: "Set expiry in a Redis Lua script.",
          })
          .expect(200, { tags: ["redis", "lua"], collection: null });
        assert.equal(
          await Tag.countDocuments({ userId: other.id, name: "lua" }),
          0,
        );
        const { body: suggestedNote } = await asOther(client.post(notesPath))
          .send({
            ...payload,
            title: "Suggested metadata",
            tags: suggestions.tags,
          })
          .expect(201);
        const otherLua = suggestedNote.tags.find(({ name }) => name === "lua");
        assert.notEqual(otherLua._id, ownerLua._id);
        assert.equal(otherLua.userId, other.id.toString());
        const { body: updated } = await asOther(
          client.put(`${notesPath}/${suggestedNote._id}`),
        )
          .send({ tags: ["lua", "redis"] })
          .expect(200);
        assert.deepEqual(
          updated.tags.map(({ name }) => name),
          ["lua", "redis"],
        );
        assert.equal(updated.tags[0]._id, otherLua._id);

        await asOther(client.delete(`${tagsPath}/${ownerLua._id}`)).expect(404);
        const { body: visibleTags } = await asOther(
          client.get(tagsPath),
        ).expect(200);
        assert.ok(
          visibleTags.every(({ userId }) => userId === other.id.toString()),
        );
        const ownedLookup = await asOther(
          client.get(notesPath).query({ tagId: otherLua._id }),
        ).expect(200);
        assert.ok(
          ownedLookup.body.some(({ _id }) => _id === suggestedNote._id),
        );

        const noteId = new mongoose.Types.ObjectId(suggestedNote._id);
        const foreignId = new mongoose.Types.ObjectId(ownerLua._id);
        await Note.collection.updateOne(
          { _id: noteId },
          { $push: { tags: foreignId } },
        );
        await asOther(
          client.get(notesPath).query({ tagId: ownerLua._id }),
        ).expect(200, []);
        const { body: detail } = await asOther(
          client.get(`${notesPath}/${suggestedNote._id}`),
        ).expect(200);
        assert.deepEqual(
          detail.tags.map(({ _id }) => _id),
          updated.tags.map(({ _id }) => _id),
        );
        assert.ok(
          (await Note.collection.findOne({ _id: noteId })).tags.some((id) =>
            id.equals(foreignId),
          ),
        );
      },
    );

    await t.test(
      "keeps bulk import and same-key retries compatible",
      async () => {
        await Subscription.create({
          accountId: other.id,
          plan: "pro",
          status: "active",
          currentPeriodEnd: new Date(Date.now() + 60_000),
        });
        const input = {
          notes: [
            {
              key: "tag-migration-smoke",
              title: "Redis Markdown",
              content: "# Redis",
            },
          ],
        };
        const importNotes = () =>
          asOther(client.post(`${notesPath}/import`))
            .send(input)
            .expect(200);
        const initialImport = await importNotes();
        const retriedImport = await importNotes();
        assert.deepEqual(retriedImport.body, initialImport.body);
        const [{ status, noteId }] = initialImport.body.results;
        assert.equal(status, "saved");
        const { body } = await asOther(
          client.get(`${notesPath}/${noteId}`),
        ).expect(200);
        assert.deepEqual(body.tags, []);
      },
    );
    await t.test(
      "favorites are scoped, idempotent and leave note timestamps and embeddings intact",
      async () => {
        const { body: firstNote } = await authorized(client.post(notesPath))
          .send({
            title: "Favorite ordering first",
            content: "favorite fixture",
          })
          .expect(201);
        const { body: nextNote } = await authorized(client.post(notesPath))
          .send({
            title: "Favorite ordering second",
            content: "favorite fixture second",
          })
          .expect(201);
        const path = `${notesPath}/${firstNote._id}/favorite`;
        const listFavorites = () =>
          authorized(client.get(notesPath).query({ favorite: "true" }));
        await listFavorites().expect(200, []);
        await client
          .put(path)
          .set("Origin", testOrigin)
          .send({ favorite: true })
          .expect(401);
        await asOther(client.put(path)).send({ favorite: true }).expect(404);
        await authorized(client.put(`${notesPath}/bad-id/favorite`))
          .send({ favorite: true })
          .expect(400);
        for (const body of [
          {},
          { favorite: "true" },
          { favorite: true, title: "changed" },
        ]) {
          await authorized(client.put(path)).send(body).expect(400);
        }
        const before = await Note.collection.findOne({
          _id: new mongoose.Types.ObjectId(firstNote._id),
        });
        const replies = await Promise.all(
          Array.from({ length: 4 }, () =>
            authorized(client.put(path)).send({ favorite: true }).expect(200),
          ),
        );
        const { favoritedAt } = replies[0].body;
        assert.ok(favoritedAt);
        assert.ok(
          replies.every(({ body }) => body.favoritedAt === favoritedAt),
        );
        const { favoritedAt: stored, ...after } = await Note.collection.findOne(
          { _id: before._id },
        );
        assert.equal(stored.toISOString(), favoritedAt);
        assert.deepEqual(after, before);
        const { body: secondFavorite } = await authorized(
          client.put(`${notesPath}/${nextNote._id}/favorite`),
        )
          .send({ favorite: true })
          .expect(200);
        assert.ok(secondFavorite.favoritedAt >= favoritedAt);
        const { body: list } = await listFavorites().expect(200);
        assert.deepEqual(
          list.map(({ _id }) => _id),
          [nextNote._id, firstNote._id],
        );
        assert.deepEqual(
          list.map(({ content }) => content),
          [nextNote.content, firstNote.content],
        );
        assert.ok(list.every((note) => !Object.hasOwn(note, "embedding")));
        await asOther(client.get(notesPath).query({ favorite: "true" })).expect(
          200,
          [],
        );
        const { body: detail } = await authorized(
          client.get(`${notesPath}/${firstNote._id}`),
        ).expect(200);
        assert.equal(detail.favoritedAt, favoritedAt);
        const { body: exact } = await authorized(client.post(searchPath))
          .send({ query: "Favorite ordering first", mode: "exact" })
          .expect(200);
        assert.equal(exact.results[0].favoritedAt, favoritedAt);
        for (let attempt = 0; attempt < 2; attempt += 1) {
          await authorized(client.put(path))
            .send({ favorite: false })
            .expect(200, { favoritedAt: null });
        }
        assert.deepEqual(
          await Note.collection.findOne({ _id: before._id }),
          before,
        );
        assert.deepEqual(
          (await listFavorites().expect(200)).body.map(({ _id }) => _id),
          [nextNote._id],
        );
      },
    );
  },
);
