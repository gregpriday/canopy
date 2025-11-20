import OpenAI from 'openai';

let clientInstance: OpenAI | null = null;

export function getAIClient(): OpenAI | null {
  if (clientInstance) return clientInstance;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  clientInstance = new OpenAI({ apiKey });
  return clientInstance;
}
