/**
 * Splits a page into retrievable chunks.
 *
 * Why chunk at all? A whole page is too long to cite precisely and dilutes ranking; a single
 * sentence loses context. Chunks of roughly 150–250 words that never cross a heading
 * boundary are a good middle: each is about one topic and reads sensibly on its own.
 *
 * Rules:
 *  - Never merge text across headings (so "Tuition" and "Scholarships" stay separate).
 *  - Split long sections on paragraph boundaries, then on sentence boundaries.
 *  - Overlap a few words between chunks of the same section so facts spanning a split survive.
 *  - Merge tiny trailing fragments back into the previous chunk.
 */
import { createHash } from "node:crypto";
import { CHUNK_DEFAULTS, wordCount, type Chunk, type CrawledPage } from "@matrix-eye/core";

export interface ChunkOptions {
  targetWords?: number;
  maxWords?: number;
  overlapWords?: number;
  minWords?: number;
}

/** Break text into sentence-ish units without a heavy NLP dependency. */
function splitSentences(text: string): string[] {
  // Split after . ! ? only when whitespace follows, so decimals ("6.0") and "e.g." stay intact.
  return text
    .split(/(?<=[.!?])\s+|\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Last `n` words of `text`, used as overlap context for the next chunk. */
function tail(text: string, n: number): string {
  const words = text.split(/\s+/);
  return words.slice(Math.max(0, words.length - n)).join(" ");
}

/** Group a section's paragraphs into pieces no larger than `maxWords`, aiming for `targetWords`. */
function packSection(paragraphs: string[], opts: Required<ChunkOptions>): string[] {
  // Split any oversized paragraph into sentences so every unit is small enough to pack.
  const units: string[] = [];
  for (const p of paragraphs) {
    if (wordCount(p) <= opts.maxWords) units.push(p);
    else units.push(...splitSentences(p));
  }

  const pieces: string[] = [];
  let current: string[] = [];
  let currentWords = 0;
  const flush = () => {
    if (current.length) pieces.push(current.join("\n"));
    current = [];
    currentWords = 0;
  };

  for (const unit of units) {
    const w = wordCount(unit);
    if (currentWords > 0 && currentWords + w > opts.targetWords) {
      const previous = current.join("\n");
      flush();
      // Start the next piece with a short overlap so ideas crossing the boundary stay findable.
      if (opts.overlapWords > 0) {
        const overlap = tail(previous, opts.overlapWords);
        current = [overlap];
        currentWords = wordCount(overlap);
      }
    }
    current.push(unit);
    currentWords += w;
  }
  flush();

  // A tiny last piece is more useful attached to its neighbour than indexed alone.
  if (pieces.length > 1 && wordCount(pieces[pieces.length - 1] ?? "") < opts.minWords) {
    const last = pieces.pop() ?? "";
    pieces[pieces.length - 1] += "\n" + last;
  }
  return pieces;
}

export function chunkPage(page: CrawledPage, options: ChunkOptions = {}): Chunk[] {
  const opts: Required<ChunkOptions> = { ...CHUNK_DEFAULTS, ...options };
  const chunks: Chunk[] = [];

  for (const section of page.sections) {
    const paragraphs = section.text.split("\n").filter(Boolean);
    for (const text of packSection(paragraphs, opts)) {
      const position = chunks.length;
      chunks.push({
        // Deterministic: re-crawling unchanged content yields identical ids.
        id: createHash("sha1").update(`${page.url}\u0000${position}\u0000${text}`).digest("hex").slice(0, 16),
        pageUrl: page.url,
        pageTitle: page.title,
        headingPath: section.headingPath,
        text,
        position,
      });
    }
  }
  return chunks;
}
