import { describe, expect, test } from "bun:test";
import { rewriteMediaUrls } from "./media";

describe("rewriteMediaUrls", () => {
  test("rewrites relative /media/ src attributes", () => {
    const html = '<img src="/media/hello.jpg" alt="hi">';
    expect(rewriteMediaUrls(html, "http://localhost:4000")).toBe(
      '<img src="http://localhost:4000/media/hello.jpg" alt="hi">',
    );
  });

  test("rewrites relative /media/ href attributes", () => {
    const html = '<a href="/media/doc.pdf">doc</a>';
    expect(rewriteMediaUrls(html, "http://localhost:4000")).toBe(
      '<a href="http://localhost:4000/media/doc.pdf">doc</a>',
    );
  });

  test("leaves absolute URLs untouched", () => {
    const html = '<img src="https://cdn.example.com/media/x.jpg">';
    expect(rewriteMediaUrls(html, "http://localhost:4000")).toBe(html);
  });

  test("strips a trailing slash from the api url before joining", () => {
    const html = '<img src="/media/x.jpg">';
    expect(rewriteMediaUrls(html, "http://localhost:4000/")).toBe(
      '<img src="http://localhost:4000/media/x.jpg">',
    );
  });

  test("handles multiple occurrences", () => {
    const html = '<img src="/media/a.jpg"><img src="/media/b.jpg">';
    expect(rewriteMediaUrls(html, "http://localhost:4000")).toBe(
      '<img src="http://localhost:4000/media/a.jpg"><img src="http://localhost:4000/media/b.jpg">',
    );
  });
});
