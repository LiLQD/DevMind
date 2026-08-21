import Collection from '../models/Collection.js';

export const createCollection = async (req, res) => {
  try {
    const { name } = req.body;
    const collection = new Collection({ name, userId: req.user.id });
    await collection.save();
    res.status(201).json(collection);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getCollections = async (req, res) => {
  try {
    const collections = await Collection.find({ userId: req.user.id });
    res.json(collections);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteCollection = async (req, res) => {
  try {
    await Collection.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ message: 'Collection deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
