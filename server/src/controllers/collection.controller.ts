import type { RequestHandler } from "express";
import Collection from "../models/Collection.ts";

type CollectionBody = { name?: unknown; description?: unknown };

export const createCollection: RequestHandler = async (req, res) => {
  try {
    const { name, description }: CollectionBody = req.body;
    if (name && typeof name !== "string") {
      throw new TypeError("Collection name must be a string.");
    }
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      return res.status(400).json({ message: "Collection name is required." });
    }

    const existing = await Collection.findOne({
      name: trimmedName,
      userId: req.user!.id,
    });
    if (existing) {
      return res.status(409).json({ message: "Collection already exists." });
    }

    if (description != null && typeof description !== "string") {
      throw new TypeError("Collection description must be a string.");
    }
    const collection = new Collection({
      name: trimmedName,
      description: description?.trim() || "",
      userId: req.user!.id,
    });
    await collection.save();

    res.status(201).json({ collection });
  } catch (error) {
    console.error("Create collection error:", error);
    res.status(500).json({ message: "Failed to create collection." });
  }
};

export const getCollections: RequestHandler = async (req, res) => {
  try {
    const collections = await Collection.find({ userId: req.user!.id }).sort({
      name: 1,
    });
    res.json(collections);
  } catch (error) {
    console.error("Get collections error:", error);
    res.status(500).json({ message: "Failed to fetch collections." });
  }
};

export const updateCollection: RequestHandler<{ id: string }> = async (
  req,
  res,
) => {
  try {
    const { name, description }: CollectionBody = req.body;
    const collection = await Collection.findOne({
      _id: req.params.id,
      userId: req.user!.id,
    });
    if (!collection) {
      return res.status(404).json({ message: "Collection not found." });
    }

    if (name) {
      if (typeof name !== "string") {
        throw new TypeError("Collection name must be a string.");
      }
      collection.name = name.trim();
    }
    if (description !== undefined) {
      if (typeof description !== "string") {
        throw new TypeError("Collection description must be a string.");
      }
      collection.description = description.trim();
    }

    await collection.save();
    res.json({ collection });
  } catch (error) {
    console.error("Update collection error:", error);
    res.status(500).json({ message: "Failed to update collection." });
  }
};

export const deleteCollection: RequestHandler<{ id: string }> = async (
  req,
  res,
) => {
  try {
    const collection = await Collection.findOneAndDelete({
      _id: req.params.id,
      userId: req.user!.id,
    });
    if (!collection) {
      return res.status(404).json({ message: "Collection not found." });
    }
    // Optional: remove collection reference from notes (set to null)
    // await Note.updateMany({ collection: req.params.id }, { $unset: { collection: 1 } });
    res.json({ message: "Collection deleted." });
  } catch (error) {
    console.error("Delete collection error:", error);
    res.status(500).json({ message: "Failed to delete collection." });
  }
};
