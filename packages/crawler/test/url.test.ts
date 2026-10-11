import { describe, expect, it } from "vitest";
import { hasNonPageExtension, isSameSite, normalizeUrl } from "../src";

describe("normalizeUrl", () => {
  it("resolves relative links and strips fragments", () => {
    expect(normalizeUrl("../about#team", "https://example.com/a/b/")).toBe("https://example.com/a/about");
  });

  it("removes tracking parameters and sorts the rest", () => {
    expect(normalizeUrl("https://example.com/p?utm_source=x&b=2&a=1&fbclid=z")).toBe("https://example.com/p?a=1&b=2");
  });

  it("treats a trailing slash as the same page, but keeps the root slash", () => {
    expect(normalizeUrl("https://example.com/about/")).toBe("https://example.com/about");
    expect(normalizeUrl("https://example.com")).toBe("https://example.com/");
  });

  it("rejects non-web schemes and garbage", () => {
    expect(normalizeUrl("mailto:a@b.com")).toBeNull();
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("ftp://example.com/file")).toBeNull();
    expect(normalizeUrl("http://")).toBeNull();
  });

  it("removes embedded credentials", () => {
    expect(normalizeUrl("https://user:pass@example.com/x")).toBe("https://example.com/x");
  });
});

describe("scoping helpers", () => {
  it("treats www and bare domain as one site but not subdomains or lookalikes", () => {
    expect(isSameSite("https://www.example.com/a", "https://example.com/b")).toBe(true);
    expect(isSameSite("https://blog.example.com", "https://example.com")).toBe(false);
    expect(isSameSite("https://example.com.evil.io", "https://example.com")).toBe(false);
  });

  it("flags asset files so they are not fetched as pages", () => {
    expect(hasNonPageExtension("https://example.com/brochure.pdf")).toBe(true);
    expect(hasNonPageExtension("https://example.com/logo.PNG")).toBe(true);
    expect(hasNonPageExtension("https://example.com/about")).toBe(false);
  });
});
