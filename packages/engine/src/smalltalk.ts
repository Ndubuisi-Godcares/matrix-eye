/**
 * Small talk: greetings, thanks and goodbyes.
 *
 * "Hello" is not a question about the website, so searching for it and answering "I couldn't find that"
 * makes a good assistant look broken in the first second of a conversation. These are matched narrowly
 * (the whole message must be small talk) so a real question is never swallowed, and answered without
 * retrieval or a model.
 */
import { tokenize } from "@eagles-eye/core";

export type SmallTalk = "greeting" | "thanks" | "goodbye" | "how-are-you";

const GREETINGS = new Set(["hi", "hello", "hey", "hiya", "howdy", "greetings", "yo", "hola", "salut", "morning", "afternoon", "evening"]);
const FILLER = new Set(["there", "again", "all", "everyone", "team", "assistant", "bot", "friend", "good", "a", "very", "much", "so", "ok", "okay", "please", "you", "to", "meet", "nice"]);
const THANKS = new Set(["thanks", "thank", "thx", "cheers", "appreciate", "appreciated", "ty"]);
const GOODBYES = new Set(["bye", "goodbye", "cya", "farewell", "later"]);

/** Recognise a message that is only small talk; null for anything that might be a real question. */
export function detectSmallTalk(message: string): SmallTalk | null {
  const words = tokenize(message);
  if (words.length === 0 || words.length > 5) return null;

  if (/^\s*how\s+are\s+you(\s+doing)?(\s+today)?\s*[?!.]*\s*$/i.test(message)) return "how-are-you";
  // Every word must be small talk or filler; one content word ("hello, what are the fees") makes it a question.
  const onlyFiller = (allowed: Set<string>) => words.every((w) => allowed.has(w) || FILLER.has(w));
  if (words.some((w) => GREETINGS.has(w)) && onlyFiller(GREETINGS)) return "greeting";
  if (words.some((w) => THANKS.has(w)) && onlyFiller(THANKS)) return "thanks";
  if (words.some((w) => GOODBYES.has(w)) && onlyFiller(GOODBYES)) return "goodbye";
  if (/^\s*(that'?s all|nothing else|no,? thanks?)\s*[!.]*\s*$/i.test(message)) return "goodbye";
  return null;
}

/** "AIIT | Azraa Institute of Information Technology" -> "AIIT"; falls back to a neutral name. */
export function shortSiteName(title: string | undefined, fallback = "this website"): string {
  const first = title?.split(/\s[|–—-]\s/)[0]?.trim();
  return first && first.length >= 2 ? first : fallback;
}

export function smallTalkReply(kind: SmallTalk, siteName: string): string {
  switch (kind) {
    case "greeting":
      return `Hello! I'm the assistant for ${siteName}. Ask me anything about it, for example its programmes, requirements, fees or how to get in touch.`;
    case "how-are-you":
      return `I'm doing well, thank you! How can I help you with ${siteName}?`;
    case "thanks":
      return "You're welcome! Is there anything else you'd like to know?";
    case "goodbye":
      return "Goodbye! Come back any time if you have more questions.";
  }
}
