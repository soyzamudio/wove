/** Turn a title into a kebab-case slug matching the sdk's Slug schema: ^[a-z0-9]+(?:-[a-z0-9]+)*$ */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
