import { describe, expect, it } from "vitest";
import { SseParser } from "../src";

describe("SseParser", () => {
  it("parses a complete event", () => {
    expect(new SseParser().push('event: token\ndata: {"text":"Hi"}\n\n')).toEqual([{ event: "token", data: '{"text":"Hi"}' }]);
  });

  it("handles several events in one chunk", () => {
    const out = new SseParser().push("event: token\ndata: 1\n\nevent: token\ndata: 2\n\nevent: final\ndata: 3\n\n");
    expect(out.map((m) => [m.event, m.data])).toEqual([["token", "1"], ["token", "2"], ["final", "3"]]);
  });

  it("waits for an event that is split across chunks, at any boundary", () => {
    const whole = 'event: final\ndata: {"answer":"split me"}\n\n';
    for (let cut = 1; cut < whole.length; cut++) {
      const parser = new SseParser();
      const out = [...parser.push(whole.slice(0, cut)), ...parser.push(whole.slice(cut))];
      expect(out, `cut at ${cut}`).toEqual([{ event: "final", data: '{"answer":"split me"}' }]);
    }
  });

  it("accepts CRLF line endings", () => {
    expect(new SseParser().push("event: token\r\ndata: x\r\n\r\n")).toEqual([{ event: "token", data: "x" }]);
  });

  it("ignores keep-alive comments and does not treat them as events", () => {
    expect(new SseParser().push(": keep-alive\n\n: another\n\n")).toEqual([]);
    expect(new SseParser().push(": ping\n\nevent: token\ndata: ok\n\n")).toEqual([{ event: "token", data: "ok" }]);
  });

  it("joins multi-line data and defaults the event name to 'message'", () => {
    expect(new SseParser().push("data: line one\ndata: line two\n\n")).toEqual([{ event: "message", data: "line one\nline two" }]);
  });

  it("keeps a trailing partial event buffered rather than dropping it", () => {
    const parser = new SseParser();
    expect(parser.push("event: token\ndata: par")).toEqual([]);
    expect(parser.push("tial\n\n")).toEqual([{ event: "token", data: "partial" }]);
  });
});
