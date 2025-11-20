import OpenAI from 'openai';

export interface AIStatus {
  emoji: string;
  description: string;
}

// Lazy load client to ensure process.env is populated
function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export async function generateAIStatus(diff: string, readme: string): Promise<AIStatus | null> {
  const client = getClient();
  if (!client || !diff.trim()) return null;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini', // Optimized for speed/cost
      messages: [
        {
          role: 'system',
          content: 'You are a CLI file manager observer. Analyze the Git Diff and README to identify "What is being updated?". Return a single sentence description.'
        },
        {
          role: 'user',
          content: `PROJECT CONTEXT:\n${readme}\n\nRECENT CHANGES:\n${diff}`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "status_update",
          strict: true,
          schema: {
            type: "object",
            properties: {
              emoji: {
                type: "string",
                description: "A single relevant emoji representing the work."
              },
              description: {
                type: "string",
                description: "A concise sentence (max 10 words) describing the active changes."
              }
            },
            required: ["emoji", "description"],
            additionalProperties: false
          }
        }
      },
      max_tokens: 100, 
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    return JSON.parse(content) as AIStatus;

  } catch (error) {
    return null;
  }
}