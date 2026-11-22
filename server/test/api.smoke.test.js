import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import request from "supertest";

process.env.JWT_SECRET = "smoke-test-secret";
process.env.REDIS_URL = "redis://smoke-test";
process.env.MONGODB_URI = "mongodb://smoke-test";
process.env.GEMINI_API_KEY = "smoke-test-key";

const moduleUrl = (relativePath) =>
  pathToFileURL(resolve(new URL("..", import.meta.url).pathname, relativePath))
    .href;

const query = (value) => {
  const chain = {
    select: () => chain,
    populate: () => chain,
    sort: () => chain,
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
let nextId = 1;

const matches = (document, filter) =>
  Object.entries(filter).every(([key, value]) => {
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
    collections.push(this);
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

mock.module(moduleUrl("src/models/Account.ts"), {
  exports: { default: Account },
});
mock.module(moduleUrl("src/models/Note.js"), { exports: { default: Note } });
mock.module(moduleUrl("src/models/Collection.js"), {
  exports: { default: Collection },
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
mock.module(moduleUrl("src/services/embedding.service.ts"), {
  exports: {
    generateEmbedding,
    generateQueryEmbedding: async () => [1, 0],
    cosineSimilarity: () => 1,
  },
});

const { default: app } = await import("../src/app.js");

beforeEach(() => {
  accounts.length = 0;
  notes.length = 0;
  collections.length = 0;
  nextId = 1;
  generateEmbedding.mock.resetCalls();
  generateEmbedding.mock.mockImplementation(defaultEmbedding);
});

async function register(email) {
  const response = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "password123", name: "Note Test User" })
    .expect(201);
  return `Bearer ${response.body.token}`;
}

async function createNote(auth, content = "Original content") {
  const response = await request(app)
    .post("/api/notes")
    .set("Authorization", auth)
    .send({ title: "Original title", content })
    .expect(201);
  return response.body;
}

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
