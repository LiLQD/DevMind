import type { RequestHandler } from "express";
import Tag from "../models/Tag.ts";

export const createTag: RequestHandler = async (req, res) => {
  try {
    const { name }: { name?: unknown } = req.body;
    if (name && typeof name !== "string") {
      throw new TypeError("Tag name must be a string.");
    }
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      return res.status(400).json({ message: "Tag name is required." });
    }

    // Check if tag already exists for this user
    const existing = await Tag.findOne({
      name: trimmedName,
      userId: req.user!.id,
    });
    if (existing) {
      return res.status(409).json({ message: "Tag already exists." });
    }

    const tag = new Tag({
      name: trimmedName,
      userId: req.user!.id,
    });
    await tag.save();

    res.status(201).json({ tag });
  } catch (error) {
    console.error("Create tag error:", error);
    res.status(500).json({ message: "Failed to create tag." });
  }
};

export const getTags: RequestHandler = async (req, res) => {
  try {
    const tags = await Tag.find({ userId: req.user!.id }).sort({ name: 1 });
    res.json(tags);
  } catch (error) {
    console.error("Get tags error:", error);
    res.status(500).json({ message: "Failed to fetch tags." });
  }
};

export const deleteTag: RequestHandler<{ id: string }> = async (req, res) => {
  try {
    const tag = await Tag.findOneAndDelete({
      _id: req.params.id,
      userId: req.user!.id,
    });
    if (!tag) {
      return res.status(404).json({ message: "Tag not found." });
    }
    res.json({ message: "Tag deleted." });
  } catch (error) {
    console.error("Delete tag error:", error);
    res.status(500).json({ message: "Failed to delete tag." });
  }
};
