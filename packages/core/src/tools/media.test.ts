import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import sharp from "sharp";
import { ADMIN, makeHarness, unwrap } from "../test-helpers";
import { probeDimensions, renderVariants, svgDimensions, variantWidthsFor } from "../images";
import {
  createLocalDriver, createS3Driver, resetStorage, s3ConfigFromEnv, s3PublicUrl, StorageConfigError,
} from "../storage";
import { estimateBase64Bytes, safeFilename, variantKey } from "./media";

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/** A solid-colour PNG of the requested size. */
async function png(width: number, height: number): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 90, b: 160 } },
  }).png().toBuffer();
  return new Uint8Array(buf);
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><rect width="120" height="60" fill="#123"/></svg>`;

const exists = (dir: string, key: string) => Bun.file(join(dir, "media", key)).exists();

afterEach(() => {
  // Only the knobs these tests set; the harness owns AGENTPRESS_MEDIA_DIR.
  delete process.env.AGENTPRESS_MAX_UPLOAD_MB;
  delete process.env.AGENTPRESS_STORAGE;
  resetStorage();
});

describe("variantWidthsFor", () => {
  test("never upscales — a small original yields only its own width", () => {
    expect(variantWidthsFor(300)).toEqual([300]);
    expect(variantWidthsFor(480)).toEqual([480]);
  });
  test("adds the standard widths below the original", () => {
    expect(variantWidthsFor(1200)).toEqual([480, 960, 1200]);
    expect(variantWidthsFor(2400)).toEqual([480, 960, 1600, 2400]);
  });
  test("caps the largest rendition at 3200", () => {
    expect(variantWidthsFor(5000)).toEqual([480, 960, 1600, 3200]);
  });
});

describe("svgDimensions", () => {
  test("reads the viewBox", () => {
    expect(svgDimensions(new TextEncoder().encode(SVG))).toEqual({ width: 120, height: 60 });
  });
  test("prefers explicit width/height attributes", () => {
    const svg = `<svg width="64" height="32" viewBox="0 0 120 60"></svg>`;
    expect(svgDimensions(new TextEncoder().encode(svg))).toEqual({ width: 64, height: 32 });
  });
  test("returns nulls for percentage sizes with no viewBox", () => {
    expect(svgDimensions(new TextEncoder().encode(`<svg width="100%" height="100%"></svg>`)))
      .toEqual({ width: null, height: null });
  });
});

describe("image processing", () => {
  test("probes raster dimensions", async () => {
    expect(await probeDimensions(await png(300, 200), "image/png")).toEqual({ width: 300, height: 200 });
  });
  test("renders webp renditions that are actually webp", async () => {
    const [v] = await renderVariants(await png(300, 200), "image/png", 300);
    expect(v!.width).toBe(300);
    expect(v!.format).toBe("webp");
    expect((await sharp(v!.bytes).metadata()).format).toBe("webp");
  });
  test("non-images get no renditions", async () => {
    expect(await renderVariants(new TextEncoder().encode("hello"), "text/plain", null)).toEqual([]);
  });
});

describe("estimateBase64Bytes", () => {
  test("matches the decoded length", () => {
    for (const n of [0, 1, 2, 3, 10, 1000]) {
      const bytes = new Uint8Array(n).fill(7);
      expect(estimateBase64Bytes(b64(bytes))).toBe(n);
    }
  });
});

describe("safeFilename", () => {
  test("strips path traversal and unsafe characters", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("my photo (1).png")).toBe("my-photo-1-.png");
    expect(safeFilename("///")).toBe("file");
  });
});

describe("media.upload", () => {
  test("stores a small png with dimensions and a single, non-upscaled variant", async () => {
    const h = makeHarness();
    try {
      const item = unwrap<any>(await h.call(ADMIN, "media.upload", {
        filename: "tiny.png", mime: "image/png", base64: b64(await png(300, 200)),
      }));
      expect(item.width).toBe(300);
      expect(item.height).toBe(200);
      expect(item.mime).toBe("image/png");
      expect(item.url).toBe(`/media/${item.path}`);
      expect(item.path).toBe(`${item.id}-tiny.png`);
      expect(item.variants.map((v: any) => v.width)).toEqual([300]);
      expect(item.variants[0].format).toBe("webp");
      expect(item.variants[0].url).toBe(`/media/${variantKey(item.path, 300)}`);
      expect(await exists(h.dir, item.path)).toBe(true);
      expect(await exists(h.dir, variantKey(item.path, 300))).toBe(true);
    } finally { h.cleanup(); }
  });

  test("renders the standard widths below the original", async () => {
    const h = makeHarness();
    try {
      const item = unwrap<any>(await h.call(ADMIN, "media.upload", {
        filename: "big.png", mime: "image/png", base64: b64(await png(1200, 600)),
      }));
      expect(item.variants.map((v: any) => v.width)).toEqual([480, 960, 1200]);
      for (const v of item.variants) expect(await exists(h.dir, variantKey(item.path, v.width))).toBe(true);
    } finally { h.cleanup(); }
  });

  test("stores an svg as-is with no variants but with viewBox dimensions", async () => {
    const h = makeHarness();
    try {
      const item = unwrap<any>(await h.call(ADMIN, "media.upload", {
        filename: "logo.svg", mime: "image/svg+xml", base64: b64(new TextEncoder().encode(SVG)),
      }));
      expect(item.variants).toEqual([]);
      expect(item.width).toBe(120);
      expect(item.height).toBe(60);
      expect(await Bun.file(join(h.dir, "media", item.path)).text()).toBe(SVG);
    } finally { h.cleanup(); }
  });

  test("non-images get no dimensions and no variants", async () => {
    const h = makeHarness();
    try {
      const item = unwrap<any>(await h.call(ADMIN, "media.upload", {
        filename: "notes.txt", mime: "text/plain", base64: b64(new TextEncoder().encode("hello")),
      }));
      expect(item.width).toBeNull();
      expect(item.height).toBeNull();
      expect(item.variants).toEqual([]);
    } finally { h.cleanup(); }
  });

  test("rejects payloads over the upload cap", async () => {
    const h = makeHarness();
    process.env.AGENTPRESS_MAX_UPLOAD_MB = "1";
    try {
      const res = await h.call(ADMIN, "media.upload", {
        filename: "huge.bin", mime: "application/octet-stream", base64: "A".repeat(3_000_000),
      });
      expect(res.ok).toBe(false);
      if (res.ok) throw new Error("expected failure");
      expect(res.error.code).toBe("validation_error");
      expect(res.error.message).toBe("File exceeds the 1 MB upload limit");
    } finally { h.cleanup(); }
  });

  test("media.list returns variants", async () => {
    const h = makeHarness();
    try {
      await h.call(ADMIN, "media.upload", {
        filename: "listed.png", mime: "image/png", base64: b64(await png(700, 400)),
      });
      const list = unwrap<any>(await h.call(ADMIN, "media.list", { limit: 10 }));
      expect(list.items[0].variants.map((v: any) => v.width)).toEqual([480, 700]);
    } finally { h.cleanup(); }
  });
});

describe("media.delete", () => {
  test("removes the original and every variant", async () => {
    const h = makeHarness();
    try {
      const item = unwrap<any>(await h.call(ADMIN, "media.upload", {
        filename: "gone.png", mime: "image/png", base64: b64(await png(1000, 500)),
      }));
      unwrap(await h.call(ADMIN, "media.delete", { id: item.id }));
      expect(await exists(h.dir, item.path)).toBe(false);
      for (const v of item.variants) expect(await exists(h.dir, variantKey(item.path, v.width))).toBe(false);
      const list = unwrap<any>(await h.call(ADMIN, "media.list", { limit: 10 }));
      expect(list.items).toEqual([]);
    } finally { h.cleanup(); }
  });

  test("unknown ids are not_found", async () => {
    const h = makeHarness();
    try {
      const res = await h.call(ADMIN, "media.delete", { id: "med_nope" });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe("not_found");
    } finally { h.cleanup(); }
  });
});

describe("storage drivers", () => {
  test("the local driver serves keys under /media/", () => {
    const d = createLocalDriver();
    expect(d.kind).toBe("local");
    expect(d.publicUrl("abc-photo.png")).toBe("/media/abc-photo.png");
    expect(d.publicUrl("abc-photo.png.w480.webp")).toBe("/media/abc-photo.png.w480.webp");
  });

  test("the s3 driver builds virtual-hosted urls by default", () => {
    const cfg = s3ConfigFromEnv({
      AGENTPRESS_STORAGE: "s3", AGENTPRESS_S3_BUCKET: "my-bucket", AGENTPRESS_S3_REGION: "eu-west-1",
    });
    expect(cfg.bucket).toBe("my-bucket");
    const d = createS3Driver(cfg);
    expect(d.kind).toBe("s3");
    expect(d.publicUrl("abc-photo.png")).toBe("https://my-bucket.s3.eu-west-1.amazonaws.com/abc-photo.png");
  });

  test("AGENTPRESS_S3_PUBLIC_URL overrides the base and trailing slashes are trimmed", () => {
    const cfg = s3ConfigFromEnv({
      AGENTPRESS_S3_BUCKET: "b", AGENTPRESS_S3_REGION: "us-east-2",
      AGENTPRESS_S3_PUBLIC_URL: "https://cdn.example.com/assets/",
      AGENTPRESS_S3_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
      AGENTPRESS_S3_ACCESS_KEY_ID: "k", AGENTPRESS_S3_SECRET_ACCESS_KEY: "s",
    });
    expect(cfg.endpoint).toBe("https://acct.r2.cloudflarestorage.com");
    expect(s3PublicUrl(cfg, "id-a b.png")).toBe("https://cdn.example.com/assets/id-a%20b.png");
    expect(createS3Driver(cfg).publicUrl(variantKey("id-x.png", 960)))
      .toBe("https://cdn.example.com/assets/id-x.png.w960.webp");
  });

  test("s3 config demands a bucket", () => {
    expect(() => s3ConfigFromEnv({ AGENTPRESS_STORAGE: "s3" })).toThrow(StorageConfigError);
  });
});
