export type Tag = {
  _id: string;
  name: string;
};

export type Collection = {
  _id: string;
  name: string;
  description?: string;
};

export type Note = {
  _id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  embeddingStatus?: "success" | "failed" | "pending";
  tags?: Tag[];
  collections?: Collection[];
  collection?:
    | (Pick<Collection, "name"> & Partial<Pick<Collection, "_id">>)
    | string
    | null;
  similarityScore?: number;
};

export type SearchMode = "semantic" | "exact";
