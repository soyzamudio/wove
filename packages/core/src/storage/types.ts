export interface StorageDriver {
  /** Driver identity, handy for tests and diagnostics. */
  kind: "local" | "s3";
  /** Write an object and return its public url. */
  put(key: string, bytes: Uint8Array, mime: string): Promise<{ url: string }>;
  /** Remove an object. Missing objects are not an error. */
  delete(key: string): Promise<void>;
  /** Public url for a key, without touching the backing store. */
  publicUrl(key: string): string;
}
