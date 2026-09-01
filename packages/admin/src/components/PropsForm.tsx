import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import { BlockProps, type BlockType, type Media } from "@wove/sdk";
import { describeSchema, emptyValue, type FieldDesc, type FieldKind } from "../lib/schemaIntrospect";
import { MediaPicker } from "./MediaPicker";
import { RichMarkdownEditor } from "./RichMarkdownEditor";
import { IconButton, Input, Label, Select, Textarea, cx } from "./ui";

type Props = Record<string, unknown>;

/** Set one key of an object immutably, dropping it when the value is blank+optional. */
function setKey(obj: Props, key: string, value: unknown, dropWhenEmpty: boolean): Props {
  if (dropWhenEmpty && (value === "" || value === undefined)) {
    const { [key]: _drop, ...rest } = obj;
    return rest;
  }
  return { ...obj, [key]: value };
}

// ---------------------------------------------------------------------------
// Leaf editors
// ---------------------------------------------------------------------------

function ImageField({
  value,
  onChange,
}: {
  value: { url?: string; alt?: string; mediaId?: string } | undefined;
  onChange: (v: { url: string; alt: string; mediaId?: string }) => void;
}) {
  const [picking, setPicking] = useState(false);
  const url = value?.url ?? "";
  const alt = value?.alt ?? "";

  function pick(item: Media) {
    onChange({ url: item.url, alt: item.alt ?? alt, mediaId: item.id });
  }

  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
      <div className="flex gap-2">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
          {url ? (
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-4 w-4 text-zinc-400" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <Input
            value={url}
            placeholder="/media/photo.jpg"
            aria-label="Image URL"
            onChange={(e) => onChange({ url: e.target.value, alt, mediaId: value?.mediaId })}
          />
          <Input
            value={alt}
            placeholder="Alt text"
            aria-label="Alt text"
            onChange={(e) => onChange({ url, alt: e.target.value, mediaId: value?.mediaId })}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => setPicking(true)}
        className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
      >
        Choose from media
      </button>
      <MediaPicker open={picking} onClose={() => setPicking(false)} onPick={pick} />
    </div>
  );
}

function ButtonField({
  value,
  onChange,
}: {
  value: { label?: string; href?: string; variant?: string } | undefined;
  onChange: (v: { label: string; href: string; variant: string }) => void;
}) {
  const v = { label: value?.label ?? "", href: value?.href ?? "", variant: value?.variant ?? "primary" };
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <Input
        className="col-span-2"
        value={v.label}
        aria-label="Button label"
        placeholder="Label"
        onChange={(e) => onChange({ ...v, label: e.target.value })}
      />
      <Input value={v.href} aria-label="Button link" placeholder="/signup" onChange={(e) => onChange({ ...v, href: e.target.value })} />
      <Select value={v.variant} aria-label="Button variant" onChange={(e) => onChange({ ...v, variant: e.target.value })}>
        <option value="primary">primary</option>
        <option value="secondary">secondary</option>
      </Select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kind dispatcher
// ---------------------------------------------------------------------------

function KindEditor({
  kind,
  value,
  onChange,
  id,
}: {
  kind: FieldKind;
  value: unknown;
  onChange: (v: unknown) => void;
  id?: string;
}) {
  switch (kind.kind) {
    case "string":
      if (kind.markdown) {
        return (
          <RichMarkdownEditor
            value={(value as string) ?? ""}
            onChange={(md) => onChange(md)}
            variant="compact"
            placeholder="Write Markdown…"
            surfaceId={id ? `props-${id}` : "props-markdown"}
          />
        );
      }
      return kind.multiline ? (
        <Textarea id={id} rows={6} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      );

    case "number":
      return (
        <Input
          id={id}
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      );

    case "boolean":
      return (
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-600 dark:border-zinc-700"
          />
        </label>
      );

    case "enum":
      return (
        <Select id={id} value={(value as string) ?? kind.options[0]} onChange={(e) => onChange(e.target.value)}>
          {kind.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );

    case "numberEnum":
      return (
        <Select
          id={id}
          value={String(value ?? kind.options[0])}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {kind.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );

    case "image":
      return <ImageField value={value as any} onChange={onChange} />;

    case "button":
      return <ButtonField value={value as any} onChange={onChange} />;

    case "object":
      return (
        <div className="space-y-2.5">
          <FieldList
            fields={kind.fields}
            values={(value as Props) ?? {}}
            onChange={(next) => onChange(next)}
            compact
          />
        </div>
      );

    case "array":
      return <ArrayEditor kind={kind} value={(value as unknown[]) ?? []} onChange={(v) => onChange(v)} />;

    default:
      return <div className="text-xs text-zinc-500 dark:text-zinc-400">Not editable here.</div>;
  }
}

function ArrayEditor({
  kind,
  value,
  onChange,
}: {
  kind: Extract<FieldKind, { kind: "array" }>;
  value: unknown[];
  onChange: (v: unknown[]) => void;
}) {
  const max = kind.max ?? Infinity;
  const min = kind.min ?? 0;

  function setAt(index: number, next: unknown) {
    const copy = value.slice();
    copy[index] = next;
    onChange(copy);
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const copy = value.slice();
    const [item] = copy.splice(index, 1);
    copy.splice(target, 0, item);
    onChange(copy);
  }

  return (
    <div className="space-y-2">
      {value.map((item, index) => (
        <div key={index} className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">#{index + 1}</span>
            <div className="flex items-center gap-0.5">
              <IconButton label="Move up" className="h-6 w-6" disabled={index === 0} onClick={() => move(index, -1)}>
                <ChevronUp className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label="Move down"
                className="h-6 w-6"
                disabled={index === value.length - 1}
                onClick={() => move(index, 1)}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label="Remove"
                className="h-6 w-6 hover:text-red-600"
                disabled={value.length <= min}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </div>
          <KindEditor kind={kind.item} value={item} onChange={(next) => setAt(index, next)} />
        </div>
      ))}
      <button
        type="button"
        disabled={value.length >= max}
        onClick={() => onChange([...value, emptyValue(kind.item)])}
        className={cx(
          "flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:border-blue-400 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
        )}
      >
        <Plus className="h-3 w-3" aria-hidden="true" />
        Add item
      </button>
    </div>
  );
}

function FieldList({
  fields,
  values,
  onChange,
  compact = false,
  idPrefix = "",
}: {
  fields: FieldDesc[];
  values: Props;
  onChange: (next: Props) => void;
  compact?: boolean;
  idPrefix?: string;
}) {
  return (
    <div className={compact ? "space-y-2" : "space-y-3.5"}>
      {fields.map((field) => {
        const id = idPrefix ? `${idPrefix}-${field.name}` : undefined;
        return (
          <div key={field.name}>
            <Label htmlFor={id}>
              {field.label}
              {!field.optional && <span className="ml-1 text-zinc-400">*</span>}
            </Label>
            <KindEditor
              id={id}
              kind={field.kind}
              value={values[field.name]}
              onChange={(v) => onChange(setKey(values, field.name, v, field.optional && field.kind.kind === "string"))}
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Editor for one block's props, generated from its zod schema in the sdk.
 * Every change calls `onChange` immediately so the canvas re-renders live.
 */
export function PropsForm({
  type,
  value,
  onChange,
}: {
  type: BlockType;
  value: unknown;
  onChange: (props: unknown) => void;
}) {
  const fields = useMemo(() => describeSchema(BlockProps[type]), [type]);
  return (
    <FieldList
      fields={fields}
      values={(value as Props) ?? {}}
      onChange={onChange}
      idPrefix={`prop-${type}`}
    />
  );
}
