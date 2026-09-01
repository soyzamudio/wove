import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import type { CollectionField, ImageRef } from "@wove/sdk";
import { useInvalidateTool, useToolMutation, useToolQuery, type WoveError } from "../api";
import { useDraftRecovery } from "../hooks/useDraftRecovery";
import { useToast } from "../context/ToastContext";
import { RichMarkdownEditor } from "../components/RichMarkdownEditor";
import { ImageRefField, RecoveryBanner } from "../components/editor";
import { emptyEntryData, entryDataForSave, entryTitle, fieldErrorsFromDetails } from "../lib/collections";
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  Label,
  PageHeader,
  Select,
  Spinner,
  Textarea,
  errorMessage,
} from "../components/ui";

type Data = Record<string, unknown>;

interface FormState {
  data: Data;
  status: "draft" | "published";
}

const isUrl = (value: string) => /^(https?:\/\/|\/)/i.test(value.trim());

// ---------------------------------------------------------------------------
// One field, dispatched off the collection's field definition (not JSON schema)
// ---------------------------------------------------------------------------

function FieldInput({
  field,
  value,
  onChange,
  id,
}: {
  field: CollectionField;
  value: unknown;
  onChange: (next: unknown) => void;
  id: string;
}) {
  switch (field.type) {
    case "textarea":
      return <Textarea id={id} rows={5} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;

    case "markdown":
      return (
        <RichMarkdownEditor
          value={(value as string) ?? ""}
          onChange={(md) => onChange(md)}
          variant="compact"
          placeholder="Write Markdown…"
          surfaceId={`entry-${id}`}
        />
      );

    case "number":
      return (
        <Input
          id={id}
          type="number"
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
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
          {field.label}
        </label>
      );

    case "date":
      return <Input id={id} type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;

    case "select":
      return (
        <Select id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">{field.required ? "Choose…" : "— none —"}</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      );

    case "image":
      return (
        <ImageRefField
          label=""
          value={(value as ImageRef | null) ?? null}
          onChange={(next) => onChange(next)}
        />
      );

    case "url":
      return (
        <Input
          id={id}
          type="url"
          inputMode="url"
          placeholder="https://example.com"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "text":
    default:
      return <Input id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function EntryEditor() {
  const { slug = "", id } = useParams();
  const isCreate = !id || id === "new";
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateTool();

  const collectionQuery = useToolQuery("collection.get", { slug }, { enabled: Boolean(slug) });
  const entryQuery = useToolQuery("entry.get", { collection: slug, id: id ?? "" }, { enabled: !isCreate && Boolean(slug) });

  const collection = collectionQuery.data;
  const [form, setForm] = useState<FormState>({ data: {}, status: "draft" });
  const [loaded, setLoaded] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  // Seed the form once both the definition and (for edits) the entry are in.
  useEffect(() => {
    if (!collection) return;
    if (isCreate) {
      setForm({ data: emptyEntryData(collection.fields), status: "draft" });
      setLoaded(true);
      return;
    }
    if (!entryQuery.data) return;
    setForm({
      data: { ...emptyEntryData(collection.fields), ...entryQuery.data.data },
      status: entryQuery.data.status,
    });
    setLoaded(true);
  }, [collection, entryQuery.data, isCreate, slug, id]);

  const draft = useDraftRecovery<FormState>(`entry:${slug}:${isCreate ? "new" : id}`, form, {
    enabled: loaded,
    serverUpdatedAt: entryQuery.data?.updatedAt ?? null,
  });

  function setValue(key: string, value: unknown) {
    setForm((cur) => ({ ...cur, data: { ...cur.data, [key]: value } }));
    setFieldErrors((cur) => (cur[key] ? { ...cur, [key]: "" } : cur));
    setLocalErrors((cur) => (cur[key] ? { ...cur, [key]: "" } : cur));
  }

  function onSaveError(err: WoveError) {
    const mapped = fieldErrorsFromDetails(err.details);
    setFieldErrors(mapped);
    toast.error(errorMessage(err));
  }

  const create = useToolMutation("entry.create", {
    onSuccess: (entry) => {
      toast.success("Entry created");
      draft.clear();
      invalidate("entry.list");
      invalidate("collection.list");
      navigate(`/c/${slug}/${entry.id}`, { replace: true });
    },
    onError: onSaveError,
  });

  const update = useToolMutation("entry.update", {
    onSuccess: () => {
      toast.success("Entry saved");
      draft.clear();
      invalidate("entry.list");
      invalidate("entry.get");
    },
    onError: onSaveError,
  });

  const remove = useToolMutation("entry.delete", {
    onSuccess: () => {
      toast.success("Entry deleted");
      draft.clear();
      invalidate("entry.list");
      invalidate("collection.list");
      navigate(`/c/${slug}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  /** Required + url checks run before the round-trip; core is still the authority. */
  function validate(fields: readonly CollectionField[]): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const field of fields) {
      const value = form.data[field.key];
      const blank = value === undefined || value === null || value === "" || (field.type === "boolean" && value === false);
      if (field.required && field.type !== "boolean" && blank) {
        errors[field.key] = `${field.label} is required.`;
      }
      if (field.type === "url" && typeof value === "string" && value.trim() && !isUrl(value)) {
        errors[field.key] = "Enter a full URL (https://…) or a site path (/about).";
      }
    }
    return errors;
  }

  function save() {
    if (!collection) return;
    const errors = validate(collection.fields);
    setLocalErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error("Fix the highlighted fields first.");
      return;
    }
    const data = entryDataForSave(collection.fields, form.data);
    if (isCreate) create.mutate({ collection: slug, data, status: form.status });
    else update.mutate({ collection: slug, id: id!, data, status: form.status });
  }

  const busy = create.isPending || update.isPending;
  const title = useMemo(
    () => (collection && !isCreate ? entryTitle(collection, { id: id ?? "", data: form.data }) : null),
    [collection, form.data, id, isCreate]
  );

  if (collectionQuery.isError) return <ErrorBanner message={errorMessage(collectionQuery.error)} />;
  if (entryQuery.isError) return <ErrorBanner message={errorMessage(entryQuery.error)} />;
  if (!collection || (!isCreate && !entryQuery.data)) return <Spinner />;

  return (
    <div>
      <PageHeader
        title={isCreate ? `New ${collection.name.toLowerCase()}` : title || collection.name}
        subtitle={
          <Link to={`/c/${slug}`} className="inline-flex items-center gap-1 hover:text-blue-700 dark:hover:text-blue-400">
            <ArrowLeft className="h-3 w-3" aria-hidden="true" />
            {collection.namePlural}
          </Link>
        }
        actions={
          <>
            <Select
              aria-label="Status"
              value={form.status}
              onChange={(e) => setForm((cur) => ({ ...cur, status: e.target.value as FormState["status"] }))}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </Select>
            <Button variant="primary" disabled={busy} onClick={save}>
              {busy ? "Saving…" : isCreate ? "Create entry" : "Save"}
            </Button>
            {!isCreate && (
              <Button
                variant="danger"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(`Delete "${title}"? This cannot be undone.`)) {
                    remove.mutate({ collection: slug, id: id! });
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Delete
              </Button>
            )}
          </>
        }
      />

      {draft.recoveredAt && (
        <RecoveryBanner
          savedAt={draft.recoveredAt}
          onRestore={() => {
            const restored = draft.restore();
            if (restored) setForm(restored);
          }}
          onDiscard={draft.discard}
        />
      )}

      <Card className="max-w-3xl space-y-4">
        {collection.fields.map((field) => {
          const inputId = `field-${field.key}`;
          const error = localErrors[field.key] || fieldErrors[field.key];
          return (
            <div key={field.key}>
              {field.type !== "boolean" && (
                <Label htmlFor={inputId}>
                  {field.label}
                  {field.required && <span className="ml-1 text-red-500">*</span>}
                </Label>
              )}
              <FieldInput field={field} id={inputId} value={form.data[field.key]} onChange={(v) => setValue(field.key, v)} />
              {field.help && !error && <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{field.help}</p>}
              {error && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{error}</p>}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
