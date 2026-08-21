import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Cosine Similarity  
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  
  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (magA * magB);
}

export async function generateEmbedding(text) {
  try {
    const response = await genAI.models.embedContent({
      model: 'gemini-embedding-001',
      contents: text,
      config: {
        taskType: 'RETRIEVAL_DOCUMENT',
      },
    });
    return response.embeddings?.[0]?.values || null;
  } catch (error) {
    console.error('Embedding generation failed:', error);
    return null;
  }
}

export async function generateQueryEmbedding(text) {
  try {
    const response = await genAI.models.embedContent({
      model: 'gemini-embedding-001',
      contents: text,
      config: {
        taskType: 'RETRIEVAL_QUERY',
      },
    });
    return response.embeddings?.[0]?.values || null;
  } catch (error) {
    console.error('Query embedding generation failed:', error);
    return null;
  }
}
