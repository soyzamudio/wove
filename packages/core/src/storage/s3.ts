import type { StorageDriver } from "./types";

export interface S3Config {
  bucket: string;
  region: string;
  /** Custom endpoint for R2 / MinIO / other S3-compatible stores. */
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Base url objects are served from (CDN origin). Defaults to the AWS virtual-hosted url. */
  publicUrl?: string;
}

export class StorageConfigError extends Error {}

/** Read S3 settings from the environment. Throws when a required value is missing. */
export function s3ConfigFromEnv(env: Record<string, string | undefined> = process.env): S3Config {
  const bucket = env.AGENTPRESS_S3_BUCKET;
  if (!bucket) throw new StorageConfigError("AGENTPRESS_STORAGE=s3 requires AGENTPRESS_S3_BUCKET");
  return {
    bucket,
    region: env.AGENTPRESS_S3_REGION ?? "us-east-1",
    endpoint: env.AGENTPRESS_S3_ENDPOINT || undefined,
    accessKeyId: env.AGENTPRESS_S3_ACCESS_KEY_ID || undefined,
    secretAccessKey: env.AGENTPRESS_S3_SECRET_ACCESS_KEY || undefined,
    publicUrl: env.AGENTPRESS_S3_PUBLIC_URL || undefined,
  };
}

/** Base url for public objects: the configured CDN base, else the AWS virtual-hosted url. */
export function s3PublicBase(cfg: S3Config): string {
  const base = cfg.publicUrl ?? `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;
  return base.replace(/\/+$/, "");
}

export function s3PublicUrl(cfg: S3Config, key: string): string {
  return `${s3PublicBase(cfg)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * S3-compatible driver built on Bun's native `Bun.S3Client`. The client is created
 * lazily so constructing the driver (and computing urls) never touches the network.
 */
export function createS3Driver(cfg: S3Config): StorageDriver {
  let client: any;
  const clientOf = () => {
    if (!client) {
      const S3Client = (Bun as any).S3Client;
      if (!S3Client) throw new StorageConfigError("Bun.S3Client is unavailable in this runtime");
      client = new S3Client({
        bucket: cfg.bucket,
        region: cfg.region,
        endpoint: cfg.endpoint,
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      });
    }
    return client;
  };
  return {
    kind: "s3",
    publicUrl: (key) => s3PublicUrl(cfg, key),
    async put(key, bytes, mime) {
      await clientOf().write(key, bytes, { type: mime });
      return { url: s3PublicUrl(cfg, key) };
    },
    async delete(key) {
      await clientOf().delete(key).catch(() => {});
    },
  };
}
