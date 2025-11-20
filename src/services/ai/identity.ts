import { getAIClient } from './client.js';
import type { ProjectIdentity } from './cache.js';
import { extractOutputText } from './utils.js';

export async function generateProjectIdentity(pathOrName: string): Promise<ProjectIdentity | null> {
  const client = getAIClient();
  if (!client) return null;

  try {
    const response = await client.responses.create({
      model: 'gpt-5-mini',
      input: `Analyze this project path: "${pathOrName}".
      
Return a JSON object with:
1. "emoji": A single representative emoji.
2. "title": Title Case folder name (no hyphens).
3. "gradientStart": Hex color (Bright/Neon/Pastel).
4. "gradientEnd": Hex color (Bright/Neon/Pastel).

Avoid dark colors. Output JSON only.`,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "project_identity",
          strict: true,
          schema: {
            type: "object",
            properties: {
              emoji: { type: "string" },
              title: { type: "string" },
              gradientStart: { type: "string" },
              gradientEnd: { type: "string" }
            },
            required: ["emoji", "title", "gradientStart", "gradientEnd"],
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
        '[canopy] Identity: empty response from model',
        `(status: ${response?.status}, id: ${response?.id})`
      );
      return null;
    }

    try {
      return JSON.parse(text) as ProjectIdentity;
    } catch (parseError) {
      console.error('[canopy] Identity: failed to parse JSON', { text, parseError });
      return null;
    }
  } catch (error) {
    console.error('[canopy] generateProjectIdentity failed:', error);
    return null;
  }
}
