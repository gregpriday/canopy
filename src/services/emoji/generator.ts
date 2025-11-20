import OpenAI from "openai";
import type { ProjectIdentity } from './cache.js';

// Lazy load client
function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export async function generateIdentity(pathOrName: string): Promise<ProjectIdentity | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a UI Designer for a CLI tool.
Analyze the project path or folder name provided.

Output a JSON object with:
1. "emoji": A single representative emoji.
2. "title": Convert the folder name to Title Case. Remove hyphens, underscores, and convert to proper spacing.
3. "gradientStart": A hex color code.
4. "gradientEnd": A hex color code.

CRITICAL COLOR RULES:
- The text will be displayed on a DARK terminal background.
- Colors must be BRIGHT, NEON, or PASTEL.
- Avoid dark colors, black, or navy blue.
- Ensure high contrast against black.`
        },
        {
          role: "user",
          content: `Project path: "${pathOrName}"`
        }
      ],
      response_format: { type: "json_object" }
    });

    const rawOutput = response.choices[0]?.message?.content || '';

    try {
      const data = JSON.parse(rawOutput);

      if (data.emoji && data.title && data.gradientStart && data.gradientEnd) {
        return {
          emoji: data.emoji,
          title: data.title,
          gradientStart: data.gradientStart,
          gradientEnd: data.gradientEnd
        };
      }
      return null;
    } catch (parseError) {
      return null;
    }
  } catch (error) {
    return null;
  }
}

// Legacy function for backward compatibility
export async function generateEmoji(pathOrName: string): Promise<string | null> {
  const identity = await generateIdentity(pathOrName);
  return identity?.emoji || null;
}