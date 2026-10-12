import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFixtureServer, type FixtureServer } from "@matrix-eye/testing";
import { MatrixError } from "@matrix-eye/core";
import { HttpFetcher, assertPublicUrl, isBlockedAddress } from "../src";

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "::ffff:10.0.0.5",
  ])("blocks %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111"])("allows public address %s", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it("refuses anything that is not a valid IP literal", () => {
    expect(isBlockedAddress("not-an-ip")).toBe(true);
  });
});

describe("assertPublicUrl", () => {
  it("rejects internal hosts and private literals", () => {
    for (const url of ["http://localhost:3000", "http://127.0.0.1", "http://[::1]/", "http://169.254.169.254/latest", "http://printer.local/", "http://db.internal/"]) {
      expect(() => assertPublicUrl(url), url).toThrowError(MatrixError);
    }
  });

  it("rejects non-http schemes", () => {
    expect(() => assertPublicUrl("file:///etc/passwd")).toThrowError(/Only http and https/);
  });

  it("allows public URLs, and private ones only when explicitly enabled", () => {
    expect(assertPublicUrl("https://example.com/").hostname).toBe("example.com");
    expect(assertPublicUrl("http://127.0.0.1:8080/", true).hostname).toBe("127.0.0.1");
  });
});

describe("HttpFetcher safety limits", () => {
  let server: FixtureServer;
  beforeAll(async () => {
    server = await startFixtureServer();
  });
  afterAll(() => server.close());

  it("refuses to connect to a local server by default (SSRF guard)", async () => {
    const fetcher = new HttpFetcher();
    await expect(fetcher.get(`${server.baseUrl}/`)).rejects.toMatchObject({ code: "blocked_url" });
  });

  it("fetches local content when private networks are explicitly allowed", async () => {
    const doc = await new HttpFetcher({ allowPrivateNetworks: true }).get(`${server.baseUrl}/about`);
    expect(doc.status).toBe(200);
    expect(doc.body).toContain("Riverside University");
  });

  it("re-validates every redirect hop (public page redirecting to metadata IP)", async () => {
    const fetcher = new HttpFetcher({ allowPrivateNetworks: false });
    // Even though the first hop is the (blocked) local server here, the redirect target alone must also be rejected.
    expect(() => assertPublicUrl("http://169.254.169.254/latest/meta-data/")).toThrowError(MatrixError);
    await expect(fetcher.get(`${server.baseUrl}/_test/redirect-private`)).rejects.toBeInstanceOf(MatrixError);
  });

  it("stops reading bodies larger than the cap", async () => {
    const fetcher = new HttpFetcher({ allowPrivateNetworks: true, maxBytes: 100_000 });
    await expect(fetcher.get(`${server.baseUrl}/_test/huge`)).rejects.toThrowError(/larger than/);
  });

  it("does not download binary content", async () => {
    const doc = await new HttpFetcher({ allowPrivateNetworks: true }).get(`${server.baseUrl}/_test/binary`);
    expect(doc.contentType).toContain("image/png");
    expect(doc.body).toBe("");
  });
});
