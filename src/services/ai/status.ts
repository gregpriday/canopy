import { getAIClient } from './client.js';

export interface AIStatus {
  emoji: string;
  description: string;
}

export async function generateStatusUpdate(diff: string, readme: string): Promise<AIStatus | null> {
  const client = getAIClient();
  // If no diff, no AI needed
  if (!client || !diff.trim()) return null;

  try {
        // GPT-5-nano is perfect for summarization tasks
        const response = await client.responses.create({
          model: 'gpt-5-nano',
          input: `CONTEXT:\n${readme.slice(0, 500)}\n\nCHANGES:\n${diff.slice(0, 2000)}\n\n
          Task: Describe the active work in one sentence (max 8 words).
          Output JSON: { "emoji": "string", "description": "string" }`,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "status_update",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  emoji: { type: "string" },
                  description: { type: "string" }
                },
                required: ["emoji", "description"],
                additionalProperties: false
              }
            }
          }
        } as any);
    
        const content = response.output_text;
    if (!content) return null;

    return JSON.parse(content) as AIStatus;
  } catch (error) {
    return null;
  }
}
