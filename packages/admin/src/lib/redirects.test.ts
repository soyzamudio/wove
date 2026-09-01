import { describe, expect, test } from "bun:test";
import { prefillFrom, validateRedirect } from "./redirects";

describe("validateRedirect", () => {
  test("accepts a plain path-to-path redirect", () => {
    expect(validateRedirect("/old-path", "/new-path")).toEqual({ ok: true });
  });

  test("accepts a path redirecting to an absolute https URL", () => {
    expect(validateRedirect("/old-path", "https://example.com/new")).toEqual({ ok: true });
  });

  test("accepts a path redirecting to an absolute http URL", () => {
    expect(validateRedirect("/old-path", "http://example.com/new")).toEqual({ ok: true });
  });

  test("rejects empty from", () => {
    expect(validateRedirect("", "/new-path").ok).toBe(false);
  });

  test("rejects empty to", () => {
    expect(validateRedirect("/old-path", "").ok).toBe(false);
  });

  test("rejects from without leading slash", () => {
    expect(validateRedirect("old-path", "/new-path").ok).toBe(false);
  });

  test("rejects from containing spaces", () => {
    expect(validateRedirect("/old path", "/new-path").ok).toBe(false);
  });

  test("rejects from that is itself a URL", () => {
    expect(validateRedirect("https://example.com/old", "/new-path").ok).toBe(false);
  });

  test("rejects to that is neither a path nor an absolute URL", () => {
    expect(validateRedirect("/old-path", "new-path").ok).toBe(false);
  });

  test("rejects to with an unsupported scheme", () => {
    expect(validateRedirect("/old-path", "ftp://example.com/new").ok).toBe(false);
  });

  test("rejects from === to", () => {
    expect(validateRedirect("/same-path", "/same-path").ok).toBe(false);
  });

  test("trims whitespace before comparing from and to", () => {
    expect(validateRedirect("  /same-path  ", "/same-path").ok).toBe(false);
  });
});

describe("prefillFrom", () => {
  test("passes through a bare path unchanged", () => {
    expect(prefillFrom("/old-path")).toBe("/old-path");
  });

  test("strips scheme and host from an absolute URL", () => {
    expect(prefillFrom("https://example.com/old-path")).toBe("/old-path");
  });

  test("strips query string", () => {
    expect(prefillFrom("/old-path?utm_source=x")).toBe("/old-path");
  });

  test("strips hash", () => {
    expect(prefillFrom("/old-path#section")).toBe("/old-path");
  });

  test("strips query and hash together", () => {
    expect(prefillFrom("https://example.com/old-path?x=1#y")).toBe("/old-path");
  });

  test("ensures a leading slash when missing", () => {
    expect(prefillFrom("old-path")).toBe("/old-path");
  });

  test("returns root for an empty path", () => {
    expect(prefillFrom("")).toBe("/");
  });

  test("collapses doubled slashes introduced by normalization", () => {
    expect(prefillFrom("https://example.com//old-path")).toBe("/old-path");
  });
});
