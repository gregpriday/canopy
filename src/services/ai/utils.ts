/**
 * Shared utilities for AI service integrations
 */

/**
 * Extract text from OpenAI Responses API output.
 * Handles multiple response formats:
 * - Legacy: response.output_text (string)
 * - Modern: content.text.value (nested object)
 * - Older: content.text (string)
 * - SDK parsed: content.parsed (for json_schema responses)
 */
export function extractOutputText(response: any): string | null {
  // 1. Check for plain output_text (legacy format)
  if (typeof response?.output_text === 'string' && response.output_text.trim().length > 0) {
    return response.output_text;
  }

  if (Array.isArray(response?.output)) {
    for (const item of response.output) {
      if (Array.isArray(item?.content)) {
        // Check both top-level and nested content arrays
        const result = extractFromContentArray(item.content);
        if (result) return result;
      }
    }
  }

  return null;
}

/**
 * Recursively extract text from a content array.
 * Handles nested content structures.
 */
function extractFromContentArray(contentArray: any[]): string | null {
  for (const content of contentArray) {
    // 2. Check for text.value (modern structured format)
    if (typeof content?.text?.value === 'string' && content.text.value.trim().length > 0) {
      return content.text.value;
    }
    // 3. Check for text as string (older format)
    if (typeof content?.text === 'string' && content.text.trim().length > 0) {
      return content.text;
    }
    // 4. Check for parsed field (SDK may populate this for JSON schemas)
    if (content?.parsed) {
      return JSON.stringify(content.parsed);
    }
    // 5. Recursively check nested content arrays
    if (Array.isArray(content?.content)) {
      const nested = extractFromContentArray(content.content);
      if (nested) return nested;
    }
  }
  return null;
}
