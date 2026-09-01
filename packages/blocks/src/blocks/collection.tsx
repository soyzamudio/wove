import type { BlockOf, CollectionField, CollectionEntry, ImageRef } from "@wove/sdk";
import { resolveUrl, type CollectionData, type RenderContext } from "../context";
import { SIZES, imgAttrs } from "../image-attrs";
import { renderMarkdown } from "../markdown";
import { SectionHead, gridClass } from "../ui";

/** A value is renderable when it is present and not an empty string/array. */
function hasValue(v: unknown): boolean {
  if (v === null || v === undefined || v === false) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

/** Entry image values arrive either as a plain url string or as an ImageRef. */
function toImageRef(v: unknown): ImageRef | null {
  if (typeof v === "string") return v.trim() ? { url: v.trim(), alt: "" } : null;
  if (v && typeof v === "object" && typeof (v as ImageRef).url === "string" && (v as ImageRef).url) {
    const img = v as ImageRef;
    return { ...img, alt: img.alt ?? "" };
  }
  return null;
}

/**
 * Deterministic date label: dates are stored as ISO instants (usually UTC midnight),
 * so formatting in UTC keeps server and reader from disagreeing by a day.
 */
function formatDate(v: unknown): string {
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function FieldValue({ field, value, ctx }: { field: CollectionField; value: unknown; ctx: RenderContext }) {
  switch (field.type) {
    case "markdown":
      return (
        <div
          className="wv-collection__md wv-prose"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(String(value)) }}
        />
      );
    case "date":
      return <p className="wv-collection__field wv-collection__field--date">{formatDate(value)}</p>;
    case "boolean":
      return (
        <p className="wv-collection__field wv-collection__field--bool">
          <span aria-hidden="true">✓</span> {field.label}
        </p>
      );
    case "url": {
      const href = String(value);
      return (
        <p className="wv-collection__field">
          <a className="wv-collection__link" href={resolveUrl(href, ctx)}>
            {href}
          </a>
        </p>
      );
    }
    default:
      return <p className="wv-collection__field">{String(value)}</p>;
  }
}

function Entry({
  entry,
  data,
  ctx,
  clamp,
}: {
  entry: CollectionEntry;
  data: CollectionData;
  ctx: RenderContext;
  clamp: boolean;
}) {
  const { fields, titleFieldKey } = data.collection;
  const values = (entry.data ?? {}) as Record<string, unknown>;

  const imageField = fields.find((f) => f.type === "image" && hasValue(values[f.key]));
  const image = imageField ? toImageRef(values[imageField.key]) : null;
  const title = hasValue(values[titleFieldKey]) ? String(values[titleFieldKey]) : "";
  const rest = fields.filter(
    (f) => f.key !== titleFieldKey && f.key !== imageField?.key && f.type !== "image" && hasValue(values[f.key]),
  );

  return (
    <article className="wv-collection__entry">
      {image ? (
        <div className="wv-collection__media">
          <img {...imgAttrs(image, ctx, SIZES.collection)} alt={image.alt ?? title} loading="lazy" />
        </div>
      ) : null}
      <div className={clamp ? "wv-collection__body wv-collection__body--clamp" : "wv-collection__body"}>
        {title ? <h3 className="wv-h3 wv-collection__title">{title}</h3> : null}
        {rest.map((field) => (
          <FieldValue key={field.key} field={field} value={values[field.key]} ctx={ctx} />
        ))}
      </div>
    </article>
  );
}

export function CollectionBlock({ props, ctx }: { props: BlockOf<"collection">["props"]; ctx: RenderContext }) {
  const data = ctx.collections?.[props.collection];

  if (!data) {
    return (
      <div className="wv-in wv-collection wv-collection--empty">
        <SectionHead headline={props.headline} />
        <div className="wv-collection__placeholder">
          <p className="wv-collection__placeholder-slug">{props.collection}</p>
          <p className="wv-collection__placeholder-note">entries appear on the published site</p>
        </div>
      </div>
    );
  }

  const entries = data.entries.slice(0, props.limit);
  const grid = props.layout === "grid";

  return (
    <div className={`wv-in wv-collection wv-collection--${props.layout}`}>
      <SectionHead headline={props.headline} />
      <div className={grid ? gridClass(props.columns) : "wv-collection__list"}>
        {entries.map((entry) => (
          <Entry key={entry.id} entry={entry} data={data} ctx={ctx} clamp={grid} />
        ))}
      </div>
    </div>
  );
}
