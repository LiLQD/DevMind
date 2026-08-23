#!/usr/bin/env python3
"""
DevMind seed script — creates real, hand-written technical notes via the API.

Usage:
    python3 seed.py

Config via env vars (optional, falls back to defaults below):
    DEVMIND_API_URL, DEVMIND_EMAIL, DEVMIND_PASSWORD

Requires: pip install requests
"""

import os
import sys
import time
import requests

from notes_data import NOTES, COLLECTIONS, TAGS

API_URL = os.environ.get("DEVMIND_API_URL", "https://devmind-backend-production.up.railway.app/api")
EMAIL = os.environ.get("DEVMIND_EMAIL", "test@test.com")
PASSWORD = os.environ.get("DEVMIND_PASSWORD", "123456")

SLEEP_BETWEEN_CALLS = 0.25  # be gentle with the API


def login():
    print("🔐 Logging in...")
    resp = requests.post(
        f"{API_URL}/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=15,
    )
    resp.raise_for_status()
    token = resp.json().get("token")
    if not token:
        print("❌ Login failed — no token in response:", resp.text)
        sys.exit(1)
    print("✅ Token obtained.")
    return token


def get_existing(session, endpoint):
    """Return {name: id} for all existing items at /collections or /tags."""
    resp = session.get(f"{API_URL}/{endpoint}", timeout=15)
    resp.raise_for_status()
    data = resp.json()
    # tolerate either a bare list or {"data": [...]}
    items = data if isinstance(data, list) else data.get("data", [])
    return {item["name"]: item["_id"] for item in items if "name" in item and "_id" in item}


def get_or_create_collection(session, name, cache):
    if name in cache:
        return cache[name]
    resp = session.post(f"{API_URL}/collections", json={"name": name}, timeout=15)
    if resp.status_code >= 400:
        print(f"  ❌ Failed to create collection '{name}': {resp.status_code} {resp.text}")
        return None
    body = resp.json()
    cid = body.get("collection", {}).get("_id") or body.get("_id")
    cache[name] = cid
    return cid


def get_or_create_tag(session, name, cache):
    if name in cache:
        return cache[name]
    resp = session.post(f"{API_URL}/tags", json={"name": name}, timeout=15)
    if resp.status_code >= 400:
        print(f"  ❌ Failed to create tag '{name}': {resp.status_code} {resp.text}")
        return None
    body = resp.json()
    tid = body.get("tag", {}).get("_id") or body.get("_id")
    cache[name] = tid
    return tid


def main():
    token = login()
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })

    # --- collections ---
    print("📁 Creating/fetching collections...")
    collection_cache = get_existing(session, "collections")
    collection_ids = {}
    for name in COLLECTIONS:
        cid = get_or_create_collection(session, name, collection_cache)
        if cid:
            collection_ids[name] = cid
            print(f"  ✅ {name} -> {cid}")
        time.sleep(SLEEP_BETWEEN_CALLS)

    # --- tags ---
    print("🏷️  Creating/fetching tags...")
    tag_cache = get_existing(session, "tags")
    tag_ids = {}
    for name in TAGS:
        tid = get_or_create_tag(session, name, tag_cache)
        if tid:
            tag_ids[name] = tid
            print(f"  ✅ {name} -> {tid}")
        time.sleep(SLEEP_BETWEEN_CALLS)

    # --- notes ---
    print(f"📝 Creating {len(NOTES)} notes...")
    created = 0
    failed = []

    for i, note in enumerate(NOTES, 1):
        collection_id = collection_ids.get(note["collection"])
        if not collection_id:
            print(f"  ❌ [{i}] Skipping '{note['title']}' — unknown collection '{note['collection']}'")
            failed.append(note["title"])
            continue

        note_tag_ids = [tag_ids[t] for t in note["tags"] if t in tag_ids]

        payload = {
            "title": note["title"],
            "content": note["content"],
            "collection": collection_id,
            "tags": note_tag_ids,
        }

        resp = session.post(f"{API_URL}/notes", json=payload, timeout=20)
        if resp.status_code < 300:
            body = resp.json()
            nid = body.get("_id") or body.get("note", {}).get("_id")
            if nid:
                created += 1
                print(f"  ✅ [{i}/{len(NOTES)}] {note['title'][:60]}")
            else:
                print(f"  ⚠️  [{i}/{len(NOTES)}] Unexpected response for '{note['title']}': {resp.text[:200]}")
                failed.append(note["title"])
        else:
            print(f"  ❌ [{i}/{len(NOTES)}] Failed '{note['title']}': {resp.status_code} {resp.text[:200]}")
            failed.append(note["title"])

        time.sleep(SLEEP_BETWEEN_CALLS)

    print()
    print(f"🎉 Successfully created {created}/{len(NOTES)} notes.")
    if failed:
        print(f"⚠️  {len(failed)} failed:")
        for t in failed:
            print(f"   - {t}")


if __name__ == "__main__":
    main()
