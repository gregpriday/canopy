import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy', // Prevent crash if key missing, check in function
});

export async function generateEmoji(name: string): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  try {
    const response = await client.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: "You are a classifier that helps developers. You choose a single representative emoji for a project folder. You output valid JSON."
        },
        {
          role: "user",
          content: `Analyze the project folder name "${name}" and choose a single representative emoji. Prioritize the tail of the path.
          
          Return the result as a valid JSON object with a single key "emoji". 
          Example: { "emoji": "🚀" }`
        }
      ],
      response_format: { type: "json_object" }
    });

    const rawOutput = response.choices[0]?.message?.content || '';

    try {
      const data = JSON.parse(rawOutput);
      
      if (data.emoji && typeof data.emoji === 'string') {
        return data.emoji;
      } else {
        // Silently fail as per user request
        return null;
      }
    } catch (parseError) {
      // Silently fail as per user request
      return null;
    }
  } catch (error) {
    // Silently fail as per user request
    return null;
  }
}
