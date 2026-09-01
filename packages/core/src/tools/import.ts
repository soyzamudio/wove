import { ImportOptions, ToolCatalog, ToolDescriptions } from "@wove/sdk";
import { getJob, listJobs, MAX_LISTED_JOBS } from "../import/jobs";
import { startImport } from "../import/wordpress/run";
import { badRequest, defineTool, notFound } from "./registry";

/** Hard ceiling on a WXR upload. Real exports are a few MB; 200 MB is already generous. */
export const MAX_WXR_BYTES = 200 * 1024 * 1024;

/** Decode the tool payload into XML text, enforcing the size cap on the way. */
export function decodeWxr(xml: string, encoding: "utf8" | "base64"): string {
  if (encoding === "base64") {
    const b64 = xml.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
    if (Math.floor((b64.length * 3) / 4) > MAX_WXR_BYTES) {
      throw badRequest(`WXR file exceeds the ${MAX_WXR_BYTES / 1024 / 1024} MB import limit`);
    }
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    } catch {
      throw badRequest("`xml` is not valid base64 data");
    }
    return new TextDecoder().decode(bytes);
  }
  if (Buffer.byteLength(xml, "utf8") > MAX_WXR_BYTES) {
    throw badRequest(`WXR file exceeds the ${MAX_WXR_BYTES / 1024 / 1024} MB import limit`);
  }
  return xml;
}

export const importWordpress = defineTool({
  name: "import.wordpress",
  description: ToolDescriptions["import.wordpress"],
  input: ToolCatalog["import.wordpress"].input,
  output: ToolCatalog["import.wordpress"].output,
  scopes: ToolCatalog["import.wordpress"].scopes,
  handler: (ctx, input) => {
    const xml = decodeWxr(input.xml, input.encoding);
    if (!/<rss[\s>]/i.test(xml.slice(0, 4096))) {
      throw badRequest("That does not look like a WordPress WXR export (no <rss> element)");
    }
    return startImport(ctx, xml, ImportOptions.parse(input.options ?? {}));
  },
});

export const importStatus = defineTool({
  name: "import.status",
  description: ToolDescriptions["import.status"],
  input: ToolCatalog["import.status"].input,
  output: ToolCatalog["import.status"].output,
  scopes: ToolCatalog["import.status"].scopes,
  mutation: false,
  handler: (_ctx, input) => {
    const job = getJob(input.id);
    if (!job) throw notFound(`No import job with id "${input.id}"`);
    return job;
  },
});

export const importList = defineTool({
  name: "import.list",
  description: ToolDescriptions["import.list"],
  input: ToolCatalog["import.list"].input,
  output: ToolCatalog["import.list"].output,
  scopes: ToolCatalog["import.list"].scopes,
  mutation: false,
  handler: () => listJobs(MAX_LISTED_JOBS),
});

export const importTools = [importWordpress, importStatus, importList];
