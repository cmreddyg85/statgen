/**
 * Parses pasted data that is strict JSON or a JS object literal (unquoted keys,
 * single quotes, trailing commas). Runs in the user's own browser on text they
 * pasted themselves.
 */
export function parseLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (jsonError) {
    try {
      return new Function(`"use strict"; return (${text});`)();
    } catch {
      throw jsonError; // report the plain JSON error
    }
  }
}
