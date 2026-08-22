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

export async function generateQueryEmbedding(text) {
  try {
    const response = await genAI.models.embedContent({
      model: 'gemini-embedding-001',
      contents: text,
      config: {
        taskType: 'RETRIEVAL_QUERY',  // Important: different task type
      },
    });
    return response.embeddings?.[0]?.values || null;
  } catch (error) {
    console.error('Query embedding generation failed:', error);
    return null;
  }
}

export function filterStopWords(text) {
  // Simple stop-word filtering
  const stopWords = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
    'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
    'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
    'about', 'if', 'can', 'when', 'use', 'what', 'which', 'how', 'get',
    'your', 'just', 'like', 'so', 'then', 'some', 'could', 'see', 'time',
    'other', 'than', 'into', 'them', 'these', 'make', 'more', 'way', 'first',
  ]);
  
  return text.split(' ')
    .filter(word => word.length > 2 && !stopWords.has(word.toLowerCase()))
    .join(' ');
}
