import Tag from '../models/Tag.js';

export const createTag = async (req, res) => {
  try {
    const { name } = req.body;
    const tag = new Tag({ name, userId: req.user.id });
    await tag.save();
    res.status(201).json(tag);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getTags = async (req, res) => {
  try {
    const tags = await Tag.find({ userId: req.user.id });
    res.json(tags);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteTag = async (req, res) => {
  try {
    await Tag.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ message: 'Tag deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
