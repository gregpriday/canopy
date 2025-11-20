import { getAIClient } from './client.js';
import type { ProjectIdentity } from './cache.js';

export async function generateProjectIdentity(pathOrName: string): Promise<ProjectIdentity | null> {
  const client = getAIClient();
  if (!client) return null;

  try {
    // GPT-5-mini is smart enough for creative direction
    const response = await client.responses.create({
      model: 'gpt-5-mini',
      input: `Analyze this project path: "${pathOrName}".
      
      Return a JSON object with:
      1. "emoji": A single representative emoji.
      2. "title": Title Case folder name (no hyphens).
      3. "gradientStart": Hex color (Bright/Neon/Pastel).
      4. "gradientEnd": Hex color (Bright/Neon/Pastel).
      
      Avoid dark colors.`,
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
      }
    } as any);

    // In Responses API, output_text contains the generated content
    const content = response.output_text;
    if (!content) return null;

    return JSON.parse(content) as ProjectIdentity;
  } catch (error) {
    return null;
  }
}
