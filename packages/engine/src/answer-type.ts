/**
 * Answer-type heuristics.
 *
 * Some questions can only be answered by a passage containing a number: "How many...", "How much...",
 * "When...", "What is the deadline...". Keyword search cannot tell that a passage stating "about 12,000
 * students" answers "How many students?" better than one that merely mentions students. These helpers
 * let ranking and sentence selection prefer passages that contain a figure when a figure is wanted.
 */

/** Questions whose answer is (or contains) a number, date or amount. */
const NUMERIC_INTENT = /\b(how\s+(many|much|long|old|far|big|large|often)|when|deadline|date|dates|what\s+time|price|prices|cost|costs|percent|percentage|number\s+of)\b/i;

export function expectsNumber(question: string): boolean {
  return NUMERIC_INTENT.test(question);
}

export function containsNumber(text: string): boolean {
  return /\d/.test(text);
}
