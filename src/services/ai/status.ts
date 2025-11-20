import { getAIClient } from './client.js';
import { extractOutputText } from './utils.js';

export interface AIStatus {
  emoji: string;
  description: string;
}

export async function generateStatusUpdate(diff: string, readme: string): Promise<AIStatus | null> {
  const client = getAIClient();
  // If no diff, no AI needed
  if (!client || !diff.trim()) return null;

  try {
    const diffSnippet = diff.slice(0, 2000);
    const readmeSnippet = readme.slice(0, 500);

    const response = await client.responses.create({
      model: 'gpt-5-nano',
      input: `CONTEXT:\n${readmeSnippet}\n\nCHANGES:\n${diffSnippet}\n\nTask: Describe the active work in one short sentence (max 8 words). Respond as JSON only with shape { "emoji": "string", "description": "string" }.`,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'status_update',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              emoji: { type: 'string' },
              description: { type: 'string' }
            },
            required: ['emoji', 'description'],
            additionalProperties: false
          }
        }
      },
      reasoning: { effort: 'minimal' },
      max_output_tokens: 96
    } as any);

    const text = extractOutputText(response);
    if (!text) {
      console.error(
        '[canopy] AI status: empty response from model',
        `(status: ${response?.status}, id: ${response?.id})`
      );
      return null;
    }

    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed.emoji !== 'string' || typeof parsed.description !== 'string') {
        console.error('[canopy] AI status: invalid JSON shape', parsed);
        return null;
      }
      return parsed as AIStatus;
    } catch (parseError) {
      console.error('[canopy] AI status: failed to parse JSON', { text, parseError });
      return null;
    }
  } catch (error) {
    console.error('[canopy] generateStatusUpdate failed', error);
    return null;
  }
}
