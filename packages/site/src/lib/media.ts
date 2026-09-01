/**
 * Content Markdown/HTML from core may reference media as an absolute URL
 * (`https://...`) or as a site-relative path (`/media/...`). Relative paths
 * need to be rewritten to point at core's own origin so they resolve
 * correctly from the (separately-hosted) public site.
 *
 * Pure function so it's covered directly by unit tests, independent of the
 * markdown renderer.
 */
export function rewriteMediaUrls(html: string, apiUrl: string): string {
  const base = apiUrl.replace(/\/+$/, "");
  return html.replace(/(src|href)="(\/media\/[^"]*)"/g, (_match, attr: string, path: string) => {
    return `${attr}="${base}${path}"`;
  });
}
