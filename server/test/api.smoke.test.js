import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import request from "supertest";

process.env.JWT_SECRET = "smoke-test-secret";
process.env.REDIS_URL = "redis://smoke-test";
process.env.MONGODB_URI = "mongodb://smoke-test";
process.env.GEMINI_API_KEY = "smoke-test-key";
process.env.NODE_ENV = "production";
process.env.ENABLE_MOCK_BILLING = "true";

const moduleUrl = (relativePath) =>
  pathToFileURL(resolve(new URL("..", import.meta.url).pathname, relativePath))
    .href;

const query = (value) => {
  const chain = {
    select: () => chain,
    populate: () => chain,
    sort: () => chain,
    lean: () => chain,
    // oxlint-disable-next-line unicorn/no-thenable
    then: (resolveValue, rejectValue) =>
      Promise.resolve(value).then(resolveValue, rejectValue),
    catch: (rejectValue) => Promise.resolve(value).catch(rejectValue),
  };
  return chain;
};

const accounts = [];
const notes = [];
const collections = [];
const tags = [];
const subscriptions = [];
const usageRecords = [];
const findSubscription = mock.fn((filter) =>
  query(subscriptions.find((record) => matches(record, filter)) ?? null),
);
const usageWrites = mock.fn(async (filter, { $inc }, options) => {
  const { $or, ...identity } = filter;
  let record = usageRecords.find((entry) => matches(entry, identity));
  if (
    record &&
    $or &&
    !$or.some(({ semanticSearchRequests: condition }) =>
      condition.$exists === false
        ? !Object.hasOwn(record, "semanticSearchRequests")
        : record.semanticSearchRequests < condition.$lt,
    )
  ) {
    if (options?.upsert)
      throw Object.assign(new Error("Duplicate month"), { code: 11000 });
    return { matchedCount: 0, upsertedCount: 0 };
  }
  const matchedCount = record ? 1 : 0;
  if (!record && !options?.upsert) return { matchedCount, upsertedCount: 0 };
  if (!record) {
    record = {
      ...identity,
      semanticSearchRequests: 0,
      noteEmbeddingRequests: 0,
    };
    usageRecords.push(record);
  }
  for (const [counter, amount] of Object.entries($inc)) {
    record[counter] = (record[counter] ?? 0) + amount;
  }
  return { matchedCount, upsertedCount: 1 - matchedCount };
});
let nextId = 1;

const matches = (document, filter) =>
  Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some((clause) => matches(document, clause));
    if (value instanceof RegExp) return value.test(document[key]);
    if (Array.isArray(document[key])) return document[key].includes(value);
    return String(document[key]) === String(value);
  });

class Account {
  constructor(data) {
    Object.assign(this, data, { _id: String(nextId++) });
  }

  async save() {
    accounts.push(this);
    return this;
  }

  static findOne(filter) {
    return query(accounts.find((account) => matches(account, filter)) || null);
  }

  static findById(id) {
    return query(
      accounts.find((account) => String(account._id) === String(id)) || null,
    );
  }
}

class Note {
  constructor(data) {
    Object.assign(this, data, {
      _id: String(nextId++),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async save() {
    const existing = notes.findIndex((note) => note._id === this._id);
    const snapshot = this.toObject();
    if (existing === -1) notes.push(snapshot);
    else notes[existing] = snapshot;
    return this;
  }

  toObject() {
    return structuredClone({ ...this });
  }

  async populate() {
    return this;
  }

  static find(filter) {
    return query(
      notes
        .filter((note) => matches(note, filter))
        .map((note) => Note.fromSnapshot(note)),
    );
  }

  static countDocuments(filter) {
    return Promise.resolve(
      notes.filter((note) => matches(note, filter)).length,
    );
  }

  static findById(id) {
    const note = notes.find((storedNote) => storedNote._id === String(id));
    return query(note ? Note.fromSnapshot(note) : null);
  }

  static fromSnapshot(note) {
    return Object.assign(Object.create(Note.prototype), structuredClone(note));
  }
}

Note.prototype.deleteOne = async function deleteOne() {
  const index = notes.findIndex((note) => note._id === this._id);
  if (index !== -1) notes.splice(index, 1);
};

class Collection {
  constructor(data) {
    Object.assign(this, data, {
      _id: String(nextId++),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async save() {
    if (!collections.includes(this)) collections.push(this);
    return this;
  }

  static findOne(filter) {
    return query(
      collections.find((collection) => matches(collection, filter)) || null,
    );
  }
}

class RedisStore {
  init() {}

  async increment() {
    return { totalHits: 1, resetTime: new Date(Date.now() + 60_000) };
  }

  async decrement() {}

  async resetKey() {}
}

class Tag {
  constructor(data) {
    Object.assign(this, data, { _id: String(nextId++) });
  }

  async save() {
    tags.push(this);
  }

  static findOne(filter) {
    return query(tags.find((tag) => matches(tag, filter)) || null);
  }

  static findOneAndDelete(filter) {
    const index = tags.findIndex((tag) => matches(tag, filter));
    return query(index === -1 ? null : tags.splice(index, 1)[0]);
  }
}

mock.module(moduleUrl("src/models/Account.ts"), {
  exports: { default: Account },
});
mock.module(moduleUrl("src/models/Note.ts"), { exports: { default: Note } });
mock.module(moduleUrl("src/models/Collection.ts"), {
  exports: { default: Collection },
});
mock.module(moduleUrl("src/models/Tag.ts"), { exports: { default: Tag } });
mock.module(moduleUrl("src/models/Subscription.ts"), {
  exports: {
    default: {
      findOne: findSubscription,
    },
  },
});
mock.module(moduleUrl("src/models/MonthlyUsage.ts"), {
  exports: {
    default: {
      init: async () => {},
      updateOne: usageWrites,
      findOne: (filter) =>
        query(usageRecords.find((record) => matches(record, filter)) ?? null),
    },
  },
});
mock.module(moduleUrl("src/models/SearchLog.ts"), {
  exports: {
    default: class SearchLog {
      async save() {}
    },
  },
});
mock.module(moduleUrl("src/config/redis.ts"), {
  exports: {
    default: {
      call: async () => null,
      on: () => undefined,
      ping: async () => "PONG",
    },
  },
});
mock.module("rate-limit-redis", { exports: { default: RedisStore } });
const defaultEmbedding = async () => [1, 0];
const generateEmbedding = mock.fn(defaultEmbedding);
const generateQueryEmbedding = mock.fn(defaultEmbedding);
const { cosineSimilarity } =
  await import("../src/services/embedding.service.ts");
mock.module(moduleUrl("src/services/embedding.service.ts"), {
  exports: {
    generateEmbedding,
    generateQueryEmbedding,
    cosineSimilarity,
  },
});

const { default: app } = await import("../src/app.ts");

beforeEach(() => {
  accounts.length = 0;
  notes.length = 0;
  collections.length = 0;
  tags.length = 0;
  subscriptions.length = 0;
  usageRecords.length = 0;
  findSubscription.mock.resetCalls();
  findSubscription.mock.restore();
  usageWrites.mock.resetCalls();
  usageWrites.mock.restore();
  nextId = 1;
  generateEmbedding.mock.resetCalls();
  generateEmbedding.mock.mockImplementation(defaultEmbedding);
  generateQueryEmbedding.mock.resetCalls();
  generateQueryEmbedding.mock.mockImplementation(defaultEmbedding);
});

async function register(email) {
  const response = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "password123", name: "Note Test User" })
    .expect(201);
  return `Bearer ${response.body.token}`;
}

test("subscription access is scoped to the account and requires an active Pro period", async () => {
  await request(app).get("/api/subscription").expect(401);
  const owner = await register("pro-owner@example.com");
  const other = await register("free-account@example.com");
  const periodEnd = new Date(Date.now() + 86_400_000);
  const subscription = {
    accountId: accounts.find(({ email }) => email === "pro-owner@example.com")
      ._id,
    plan: "pro",
    status: "active",
    providerCustomerId: "private-customer-id",
    providerSubscriptionId: "private-subscription-id",
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: true,
  };
  subscriptions.push(subscription);
  const getSubscription = (auth) =>
    request(app).get("/api/subscription").set("Authorization", auth);

  const { usage: _ownerUsage, ...ownerSubscription } = (
    await getSubscription(owner).expect(200)
  ).body;
  assert.deepEqual(ownerSubscription, {
    plan: "pro",
    status: "active",
    currentPeriodEnd: periodEnd.toISOString(),
    cancelAtPeriodEnd: true,
    entitlements: { bulkMarkdownImport: true, expandedRelatedNotes: true },
  });
  const freeEntitlements = {
    bulkMarkdownImport: false,
    expandedRelatedNotes: false,
  };
  const otherResponse = await getSubscription(other)
    .query({ accountId: subscription.accountId, plan: "pro" })
    .expect(200);
  const { usage: _otherUsage, ...otherSubscription } = otherResponse.body;
  assert.deepEqual(otherSubscription, {
    plan: "free",
    status: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    entitlements: freeEntitlements,
  });

  subscription.status = "past_due";
  const pastDue = await getSubscription(owner).expect(200);
  assert.equal(pastDue.body.plan, "free");
  assert.deepEqual(pastDue.body.entitlements, freeEntitlements);

  subscription.status = "active";
  subscription.currentPeriodEnd = new Date(0);
  const expired = await getSubscription(owner).expect(200);
  assert.equal(expired.body.plan, "free");
});

test("returns account-scoped usage and resets at the UTC month boundary", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-12-31T23:59:59.999Z"),
  });
  const owner = await register("usage-owner@example.com");
  const other = await register("usage-other@example.com");
  const accountId = accounts[0]._id;
  usageRecords.push(
    {
      accountId,
      monthStart: new Date("2026-11-01T00:00:00.000Z"),
      semanticSearchRequests: 81,
      noteEmbeddingRequests: 24,
    },
    {
      accountId,
      monthStart: new Date("2026-12-01T00:00:00.000Z"),
      semanticSearchRequests: 3,
      noteEmbeddingRequests: 7,
    },
  );

  const path = "/api/subscription";
  const current = await request(app)
    .get(path)
    .set("Authorization", owner)
    .expect("Cache-Control", "no-store")
    .expect(200);
  assert.deepEqual(current.body.usage, {
    semanticSearchRequests: 3,
    noteEmbeddingRequests: 7,
    resetAt: "2027-01-01T00:00:00.000Z",
  });

  const isolated = await request(app)
    .get(path)
    .query({ accountId })
    .set("Authorization", other)
    .expect(200);
  assert.deepEqual(isolated.body.usage, {
    semanticSearchRequests: 0,
    noteEmbeddingRequests: 0,
    resetAt: "2027-01-01T00:00:00.000Z",
  });

  t.mock.timers.setTime(Date.parse("2027-01-01T00:00:00.000Z"));
  const reset = await request(app)
    .get(path)
    .set("Authorization", owner)
    .expect(200);
  assert.deepEqual(reset.body.usage, {
    semanticSearchRequests: 0,
    noteEmbeddingRequests: 0,
    resetAt: "2027-02-01T00:00:00.000Z",
  });
});

test("rejects duplicate registration and incorrect login credentials", async () => {
  const email = "registered@example.com";
  await register(email);

  await request(app)
    .post("/api/auth/register")
    .send({ email, password: "password123", name: "Duplicate Account" })
    .expect(400, { message: "Email đã tồn tại" });

  for (const credentials of [
    { email, password: "wrong-password" },
    { email: "missing@example.com", password: "password123" },
  ]) {
    await request(app)
      .post("/api/auth/login")
      .send(credentials)
      .expect(401, { message: "Email hoặc mật khẩu không đúng" });
  }
});

async function createNote(auth, content = "Original content") {
  const response = await request(app)
    .post("/api/notes")
    .set("Authorization", auth)
    .send({ title: "Original title", content })
    .expect(201);
  return response.body;
}

test("rejects duplicate tag names and scopes deletion to the owner", async () => {
  const owner = await register("tag-owner@example.com");
  const other = await register("tag-other@example.com");

  const created = await request(app)
    .post("/api/tags")
    .set("Authorization", owner)
    .send({ name: "  Work  " })
    .expect(201);
  assert.equal(created.body.tag.name, "Work");

  await request(app)
    .post("/api/tags")
    .set("Authorization", owner)
    .send({ name: "Work" })
    .expect(409, { message: "Tag already exists." });

  const path = `/api/tags/${created.body.tag._id}`;
  await request(app)
    .delete(path)
    .set("Authorization", other)
    .expect(404, { message: "Tag not found." });
  await request(app)
    .delete(path)
    .set("Authorization", owner)
    .expect(200, { message: "Tag deleted." });
});

function updateNote(auth, id, changes) {
  return request(app)
    .put(`/api/notes/${id}`)
    .set("Authorization", auth)
    .send(changes);
}

async function listNotes(auth) {
  const response = await request(app)
    .get("/api/notes")
    .set("Authorization", auth)
    .expect(200);
  return response.body;
}

test("rejects duplicate collection names and scopes updates to the owner", async () => {
  const owner = await register("collection-owner@example.com");
  const other = await register("collection-other@example.com");

  const created = await request(app)
    .post("/api/collections")
    .set("Authorization", owner)
    .send({ name: "  Work  " })
    .expect(201);
  assert.equal(created.body.collection.name, "Work");

  await request(app)
    .post("/api/collections")
    .set("Authorization", owner)
    .send({ name: "Work" })
    .expect(409, { message: "Collection already exists." });

  const path = `/api/collections/${created.body.collection._id}`;
  await request(app)
    .put(path)
    .set("Authorization", other)
    .send({ name: "Renamed" })
    .expect(404, { message: "Collection not found." });
  const updated = await request(app)
    .put(path)
    .set("Authorization", owner)
    .send({ description: "  Updated  " })
    .expect(200);
  assert.equal(updated.body.collection.name, "Work");
  assert.equal(updated.body.collection.description, "Updated");
});

test("regenerates embeddings and saves the updated note when content changes", async () => {
  const auth = await register("owner@example.com");
  const note = await createNote(auth);
  const changes = { title: "Updated title", content: "Updated content" };
  generateEmbedding.mock.resetCalls();
  generateEmbedding.mock.mockImplementation(async () => [0, 1]);

  const response = await updateNote(auth, note._id, changes).expect(200);

  assert.deepEqual(
    generateEmbedding.mock.calls.map(({ arguments: args }) => args),
    [[changes.content]],
  );
  assert.deepEqual(response.body, {
    ...note,
    ...changes,
    embeddingStatus: "success",
    embedding: [0, 1],
  });
  assert.deepEqual(await listNotes(auth), [response.body]);
});

test("saves metadata without regenerating embeddings for omitted or identical content", async () => {
  const auth = await register("owner@example.com");
  const note = await createNote(auth);
  generateEmbedding.mock.resetCalls();

  const first = await updateNote(auth, note._id, {
    title: "First title",
  }).expect(200);
  assert.deepEqual(first.body, { ...note, title: "First title" });

  const second = await updateNote(auth, note._id, {
    title: "Second title",
    content: note.content,
  }).expect(200);
  assert.deepEqual(second.body, { ...note, title: "Second title" });
  assert.equal(generateEmbedding.mock.callCount(), 0);
  assert.deepEqual(await listNotes(auth), [second.body]);
});

test("rejects updates to another account's note and to a missing note", async () => {
  const owner = await register("owner@example.com");
  const other = await register("other@example.com");
  const note = await createNote(owner);
  const changes = { content: "Unauthorized change" };
  generateEmbedding.mock.resetCalls();

  const forbidden = await updateNote(other, note._id, changes).expect(403);
  assert.deepEqual(forbidden.body, { message: "Không có quyền" });

  const missing = await updateNote(
    owner,
    "000000000000000000000001",
    changes,
  ).expect(404);
  assert.deepEqual(missing.body, { message: "Không tìm thấy ghi chú" });
  assert.equal(generateEmbedding.mock.callCount(), 0);
  assert.deepEqual(await listNotes(owner), [note]);
});

test("creates and saves a failed note when the embedding service returns null", async () => {
  const auth = await register("owner@example.com");
  generateEmbedding.mock.mockImplementation(async () => null);

  const note = await createNote(auth);

  assert.equal(note.title, "Original title");
  assert.equal(note.content, "Original content");
  assert.equal(note.embeddingStatus, "failed");
  assert.deepEqual(await listNotes(auth), [note]);
});

test("saves a failed content update and excludes its retained vector from search", async () => {
  const auth = await register("owner@example.com");
  const note = await createNote(auth, "Searchable original");
  const control = await createNote(auth, "Searchable control");
  generateEmbedding.mock.mockImplementation(async () => null);

  const failed = await updateNote(auth, note._id, {
    content: "Searchable update",
  }).expect(200);
  assert.deepEqual(failed.body, {
    ...note,
    content: "Searchable update",
    embeddingStatus: "failed",
  });
  assert.deepEqual(
    (await listNotes(auth)).find(({ _id }) => _id === note._id),
    failed.body,
  );

  const search = await request(app)
    .post("/api/notes/search")
    .set("Authorization", auth)
    .send({ query: "searchable" })
    .expect(200);
  assert.deepEqual(
    search.body.results.map(({ _id }) => _id),
    [control._id],
  );
  assert.equal(search.body.noteCount, 1);
});

test("meters only requests that attempt semantic search or note embedding", async () => {
  const auth = await register("usage@example.com");
  const note = await createNote(auth);
  await updateNote(auth, note._id, { title: "Metadata update" }).expect(200);
  generateEmbedding.mock.mockImplementation(async () => null);
  await updateNote(auth, note._id, { content: "Changed content" }).expect(200);

  const search = (body) =>
    request(app)
      .post("/api/notes/search")
      .set("Authorization", auth)
      .send(body);
  await search({ mode: "exact", query: "Changed content" }).expect(200);
  await search({ query: "" }).expect(400);
  generateQueryEmbedding.mock.mockImplementation(async () => null);
  await search({ query: "Changed content" }).expect(503);

  const now = new Date();
  const filter = {
    accountId: accounts[0]._id,
    monthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  };
  assert.deepEqual(
    usageWrites.mock.calls.map(({ arguments: args }) => args),
    [
      [filter, { $inc: { noteEmbeddingRequests: 1 } }, { upsert: true }],
      [filter, { $inc: { noteEmbeddingRequests: 1 } }, { upsert: true }],
      [
        {
          ...filter,
          $or: [
            { semanticSearchRequests: { $lt: 100 } },
            { semanticSearchRequests: { $exists: false } },
          ],
        },
        { $inc: { semanticSearchRequests: 1 } },
        { upsert: true },
      ],
    ],
  );
  assert.deepEqual(usageRecords, [
    {
      ...filter,
      semanticSearchRequests: 1,
      noteEmbeddingRequests: 2,
    },
  ]);
  assert.equal(generateQueryEmbedding.mock.callCount(), 1);
});

test("retries duplicate-key usage writes and preserves note saves when metering fails", async () => {
  const auth = await register("usage-failure@example.com");
  usageWrites.mock.mockImplementationOnce(async () => {
    throw Object.assign(new Error("Duplicate usage month"), { code: 11000 });
  });
  usageWrites.mock.mockImplementationOnce(async () => {
    throw new Error("Usage storage unavailable");
  }, 1);
  const note = await createNote(auth);
  assert.equal(note.embeddingStatus, "success");
  assert.equal(usageWrites.mock.callCount(), 2);
  const [filter, update] = usageWrites.mock.calls[0].arguments;
  assert.deepEqual(usageWrites.mock.calls[1].arguments, [filter, update]);
});

test("exact search matches literal punctuation across the owner's notes without embeddings", async () => {
  const owner = await register("exact-owner@example.com");
  const other = await register("exact-other@example.com");
  const error = "TypeError: x[0].call()";
  generateEmbedding.mock.mockImplementation(async () => null);
  const matching = await createNote(owner, error);
  assert.equal(matching.embeddingStatus, "failed");
  await createNote(owner, "TypeError: x0Xcall");
  await createNote(other, error);

  const search = (phrase) =>
    request(app)
      .post("/api/notes/search")
      .set("Authorization", owner)
      .send({ query: phrase, mode: "exact" });

  const response = await search(error.toLowerCase()).expect(200);
  assert.deepEqual(
    response.body.results.map(({ _id }) => _id),
    [matching._id],
  );
  await search("unmatched").expect(200, { results: [] });
  await search("   ").expect(400);
  assert.equal(generateQueryEmbedding.mock.callCount(), 0);
});

test("ranks semantic matches with a keyword bonus and excludes results outside the score margin", async () => {
  const auth = await register("search-owner@example.com");
  const vectors = new Map([
    ["Closest by cosine", [0.95, Math.sqrt(1 - 0.95 ** 2)]],
    ["Work on orchids", [0.92, Math.sqrt(1 - 0.92 ** 2)]],
    ["Outside the margin", [0.89, Math.sqrt(1 - 0.89 ** 2)]],
    ["Unrelated note", [0, 1]],
  ]);
  generateEmbedding.mock.mockImplementation(async (content) =>
    vectors.get(content),
  );
  const closest = await createNote(auth, "Closest by cosine");
  const keywordMatch = await createNote(auth, "Work on orchids");
  await createNote(auth, "Outside the margin");
  await createNote(auth, "Unrelated note");

  const { body } = await request(app)
    .post("/api/notes/search")
    .set("Authorization", auth)
    .send({ query: "orchids" })
    .expect(200);

  assert.deepEqual(
    body.results.map(({ _id }) => _id),
    [keywordMatch._id, closest._id],
  );
  assert.ok(body.results[0].semanticScore < body.results[1].semanticScore);
  assert.equal(body.results[0].keywordRatio, 1);
  assert.ok(
    body.results.every((result) => !Object.hasOwn(result, "embedding")),
  );
  assert.equal(body.noteCount, 4);
  assert.equal(body.totalFound, 2);
  assert.equal(body.returned, 2);
  assert.equal(body.threshold, 0.6);
});

test("saves the updated note when the embedding service rejects", async () => {
  const auth = await register("owner@example.com");
  const note = await createNote(auth);
  generateEmbedding.mock.mockImplementation(async () => {
    throw new Error("Embedding failed");
  });

  const failed = await updateNote(auth, note._id, {
    content: "Updated content",
  }).expect(200);
  assert.deepEqual(failed.body, {
    ...note,
    content: "Updated content",
    embeddingStatus: "failed",
  });
  assert.deepEqual(await listNotes(auth), [failed.body]);
});

test("server API smoke flow", async () => {
  const registerResponse = await request(app)
    .post("/api/auth/register")
    .send({
      email: "smoke@example.com",
      password: "password123",
      name: "Smoke User",
    })
    .expect(201);

  assert.equal(registerResponse.body.user.email, "smoke@example.com");
  assert.ok(registerResponse.body.token);

  const loginResponse = await request(app)
    .post("/api/auth/login")
    .send({ email: "smoke@example.com", password: "password123" })
    .expect(200);

  const token = loginResponse.body.token;
  assert.ok(token);

  const collectionResponse = await request(app)
    .post("/api/collections")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Smoke Collection", description: "Smoke test data" })
    .expect(201);

  assert.equal(collectionResponse.body.collection.name, "Smoke Collection");

  const noteResponse = await request(app)
    .post("/api/notes")
    .set("Authorization", `Bearer ${token}`)
    .send({
      title: "Smoke note",
      content: "Smoke test content",
      collections: [collectionResponse.body.collection._id],
    })
    .expect(201);

  assert.equal(noteResponse.body.title, "Smoke note");
  assert.equal(noteResponse.body.embeddingStatus, "success");

  const listResponse = await request(app)
    .get("/api/notes")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);

  assert.equal(listResponse.body.length, 1);
  assert.equal(listResponse.body[0]._id, noteResponse.body._id);

  await request(app)
    .delete(`/api/notes/${noteResponse.body._id}`)
    .set("Authorization", `Bearer ${token}`)
    .expect(200);

  const emptyListResponse = await request(app)
    .get("/api/notes")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);

  assert.deepEqual(emptyListResponse.body, []);
});

test("serves security headers and rejects unknown CORS origins", async () => {
  const response = await request(app)
    .get("/api/health")
    .set("Origin", "https://evil.example")
    .expect(200);

  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["access-control-allow-origin"], undefined);
});

test("reports dependency readiness separately from liveness", async () => {
  const response = await request(app).get("/api/ready").expect(503);

  assert.equal(response.body.status, "NOT_READY");
  assert.deepEqual(response.body.checks, { database: false, redis: true });
});

for (const [plan, allowance] of [
  ["free", 100],
  ["pro", 1000],
]) {
  test(`enforces the ${plan} monthly boundary and resets at midnight UTC`, async (t) => {
    t.mock.timers.enable({
      apis: ["Date"],
      now: new Date("2026-12-31T23:59:59.999Z"),
    });
    const auth = await register("quota@example.com");
    const accountId = accounts[0]._id;
    if (plan === "pro") {
      subscriptions.push({
        accountId,
        plan,
        status: "active",
        currentPeriodEnd: new Date("2027-02-01T00:00:00.000Z"),
      });
    }
    await createNote(auth);
    const previousMonth = usageRecords[0];
    previousMonth.semanticSearchRequests = allowance - 1;

    const search = (mode) =>
      request(app)
        .post("/api/notes/search")
        .set("Authorization", auth)
        .send({ mode, query: "Original" });

    await search("semantic").expect(200);
    const rejected = await search("semantic").expect(429);
    assert.equal(rejected.body.code, "SEMANTIC_SEARCH_QUOTA_EXCEEDED");
    assert.ok(rejected.body.message);
    assert.equal(rejected.body.resetAt, "2027-01-01T00:00:00.000Z");
    const reads = findSubscription.mock.callCount();
    const writes = usageWrites.mock.callCount();
    await search("exact").expect(200);
    assert.equal(findSubscription.mock.callCount(), reads);
    assert.equal(usageWrites.mock.callCount(), writes);
    assert.equal(generateQueryEmbedding.mock.callCount(), 1);
    assert.equal(previousMonth.semanticSearchRequests, allowance);
    assert.equal(previousMonth.noteEmbeddingRequests, 1);

    t.mock.timers.setTime(Date.parse("2027-01-01T00:00:00.000Z"));
    await search("semantic").expect(200);
    assert.equal(usageRecords[1].semanticSearchRequests, 1);
    assert.equal(usageRecords[1].noteEmbeddingRequests, 0);
    assert.equal(previousMonth.semanticSearchRequests, allowance);
  });
}

test("returns search unavailable when plan lookup or quota storage fails", async (t) => {
  const auth = await register("quota-failure@example.com");
  const log = t.mock.method(console, "error", () => {});
  const databaseError = new Error("private database detail");
  const fail = () => {
    throw databaseError;
  };
  const search = () =>
    request(app)
      .post("/api/notes/search")
      .set("Authorization", auth)
      .send({ query: "Original" })
      .expect(503, { message: "Tìm kiếm tạm thời không khả dụng" });

  findSubscription.mock.mockImplementationOnce(fail);
  await search();
  assert.equal(usageWrites.mock.callCount(), 0);

  usageWrites.mock.mockImplementationOnce(fail);
  await search();
  assert.equal(generateQueryEmbedding.mock.callCount(), 0);
  assert.equal(usageRecords.length, 0);
  assert.equal(log.mock.callCount(), 2);
  assert.ok(
    !JSON.stringify(log.mock.calls.map(({ arguments: args }) => args)).includes(
      databaseError.message,
    ),
  );
});

test("production hides mock billing routes and ignores persisted mock entitlements", async () => {
  const auth = await register("production-mock@example.com");
  subscriptions.push({
    accountId: accounts[0]._id,
    billingProvider: "mock",
    plan: "pro",
    status: "active",
    currentPeriodEnd: new Date(Date.now() + 86_400_000),
  });

  const base = "/api/mock-billing/checkouts";
  await request(app).post(base).set("Authorization", auth).expect(404);
  await request(app)
    .get(`${base}/checkout`)
    .set("Authorization", auth)
    .expect(404);
  await request(app)
    .post(`${base}/checkout/actions`)
    .set("Authorization", auth)
    .send({ action: "succeed", expectedRevision: 0 })
    .expect(404);
  await request(app)
    .post(base)
    .set("Content-Type", "application/json")
    .send("{")
    .expect(404);

  const { body } = await request(app)
    .get("/api/subscription")
    .set("Authorization", auth)
    .expect(200);
  assert.equal(body.plan, "free");
  assert.equal(body.status, null);
});

test("bulk note import requires authentication and an effective Pro plan", async () => {
  const path = "/api/notes/import";
  const item = { key: "note-1", title: "Example", content: "# Example" };
  const auth = await register("bulk-import@example.com");
  const submit = (items) =>
    request(app).post(path).set("Authorization", auth).send({ notes: items });

  await request(app)
    .post(path)
    .send({ notes: [item] })
    .expect(401);
  await submit([item]).expect(403);
  subscriptions.push({
    accountId: accounts[0]._id,
    billingProvider: "mock",
    plan: "pro",
    status: "active",
    currentPeriodEnd: new Date(Date.now() + 86_400_000),
  });
  await submit([item]).expect(403);
  subscriptions[0].billingProvider = "stripe";
  await submit([]).expect(400);
  await submit(Array.from({ length: 6 }, () => ({ ...item }))).expect(400);
  findSubscription.mock.mockImplementationOnce(() => {
    throw new Error("Subscription unavailable");
  });
  await submit([item]).expect(503);
  assert.equal(notes.length, 0);
  assert.equal(generateEmbedding.mock.callCount(), 0);
});
