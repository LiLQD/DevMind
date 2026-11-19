import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import request from "supertest";

process.env.JWT_SECRET = "smoke-test-secret";
process.env.REDIS_URL = "redis://smoke-test";

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
    if (existing === -1) notes.push(this);
    else notes[existing] = this;
    return this;
  }

  async populate() {
    return this;
  }

  static find(filter) {
    return query(notes.filter((note) => matches(note, filter)));
  }

  static findById(id) {
    return query(notes.find((note) => String(note._id) === String(id)) || null);
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

mock.module(moduleUrl("src/models/Account.js"), {
  exports: { default: Account },
});
mock.module(moduleUrl("src/models/Note.js"), { exports: { default: Note } });
mock.module(moduleUrl("src/models/Collection.js"), {
  exports: { default: Collection },
});
mock.module(moduleUrl("src/config/redis.js"), {
  exports: { default: { call: async () => null, on: () => undefined } },
});
mock.module("rate-limit-redis", { exports: { default: RedisStore } });
mock.module(moduleUrl("src/services/embedding.service.js"), {
  exports: {
    generateEmbedding: async () => [1, 0],
    generateQueryEmbedding: async () => [1, 0],
    cosineSimilarity: () => 1,
  },
});

const { default: app } = await import("../src/app.js");

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
