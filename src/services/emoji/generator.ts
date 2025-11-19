import OpenAI from "openai";
import type { ProjectIdentity } from './cache.js';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy', // Prevent crash if key missing, check in function
});

export async function generateIdentity(pathOrName: string): Promise<ProjectIdentity | null> {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini", // Use 4o-mini if available
      messages: [
        {
          role: "system",
          content: `You are a UI Designer for a CLI tool.
Analyze the project path or folder name provided.

Output a JSON object with:
1. "emoji": A single representative emoji.
2. "title": Convert the folder name to Title Case. Remove hyphens, underscores, and convert to proper spacing.
   You can use information from parent folders to create a better title.
   Examples:
   - "my-react-app" -> "My React App"
   - "user_dashboard" -> "User Dashboard"
   - "canopy" -> "Canopy"
   - "api-v2-server" -> "API V2 Server"
   - "nextjs-blog" -> "NextJS Blog"
   - "projects/foobar/website" -> "Foobar Website"
   - "clients/acme/admin-panel" -> "Acme Admin Panel"
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
