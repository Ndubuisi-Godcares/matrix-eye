/**
 * Server-sent-events parsing.
 *
 * Network chunks do not respect event boundaries: one chunk can hold half an event or three events, and a
 * multi-byte character can be split across chunks. This parser buffers until a blank line completes an event.
 */

export interface SseMessage {
  event: string;
  data: string;
}

/** Incremental SSE parser: call `push` with each decoded chunk, receive any events it completed. */
export class SseParser {
  private buffer = "";

  push(chunk: string): SseMessage[] {
    // Normalise line endings first so "\r\n\r\n" and "\n\n" both end an event.
    this.buffer += chunk.replace(/\r\n?/g, "\n");
    const messages: SseMessage[] = [];

    for (;;) {
      const end = this.buffer.indexOf("\n\n");
      if (end === -1) break;
      const block = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);

      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line === "" || line.startsWith(":")) continue; // blank line or comment (keep-alive)
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "event") event = value;
        else if (field === "data") data.push(value);
      }
      // A block that was only a comment carries no data and is not an event.
      if (data.length > 0) messages.push({ event, data: data.join("\n") });
    }
    return messages;
  }
}
