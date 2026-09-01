import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Database, GripVertical, Lock, Plus, Trash2, X } from "lucide-react";
import { resolveIcon } from "@wove/blocks";
import type { Collection, CollectionField, CollectionFieldType } from "@wove/sdk";
import { useInvalidateTool, useToolMutation, useToolQuery } from "../api";
import { slugify } from "../lib/slug";
import { useToast } from "../context/ToastContext";
import {
  FIELD_TYPES,
  slugifyKey,
  titleFieldOptions,
  validateFields,
  type FieldIssue,
} from "../lib/collections";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  IconButton,
  Input,
  Label,
  Modal,
  PageHeader,
  Select,
  Spinner,
  cx,
  errorMessage,
} from "../components/ui";

/** A field row in the editor: the sdk shape plus a stable dnd id and whether core already knows its key. */
interface DraftField extends CollectionField {
  uid: string;
  /** True once the field has been saved — the key becomes immutable. */
  locked: boolean;
}

interface Draft {
  name: string;
  namePlural: string;
  icon: string;
  public: boolean;
  titleFieldKey: string;
  fields: DraftField[];
}

let uidCounter = 0;
const nextUid = () => `f${++uidCounter}`;

function draftFrom(collection: Collection): Draft {
  return {
    name: collection.name,
    namePlural: collection.namePlural,
    icon: collection.icon,
    public: collection.public,
    titleFieldKey: collection.titleFieldKey,
    fields: collection.fields.map((f) => ({ ...f, uid: nextUid(), locked: true })),
  };
}

function newField(): DraftField {
  return { uid: nextUid(), locked: false, key: "", label: "", type: "text", required: false };
}

/** Strip the editor-only bookkeeping before sending to core. */
function toFieldInput(field: DraftField): CollectionField {
  const { uid: _uid, locked: _locked, options, help, ...rest } = field;
  return {
    ...rest,
    key: rest.key.trim(),
    label: rest.label.trim(),
    ...(rest.type === "select" ? { options: (options ?? []).map((o) => o.trim()).filter(Boolean) } : {}),
    ...(help?.trim() ? { help: help.trim() } : {}),
  };
}

// ---------------------------------------------------------------------------
// Options chips (select fields only)
// ---------------------------------------------------------------------------

function OptionsInput({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [text, setText] = useState("");

  function commit() {
    const next = text.trim();
    if (!next || value.includes(next)) {
      setText("");
      return;
    }
    onChange([...value, next]);
    setText("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-200 px-1.5 py-1 dark:border-zinc-800">
      {value.map((option) => (
        <span
          key={option}
          className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
        >
          {option}
          <button
            type="button"
            aria-label={`Remove option ${option}`}
            onClick={() => onChange(value.filter((o) => o !== option))}
            className="text-zinc-400 hover:text-red-600"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={text}
        aria-label="Add an option"
        placeholder={value.length === 0 ? "Add options…" : "Add…"}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !text && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        className="min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 text-sm focus:outline-none"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// One sortable field row
// ---------------------------------------------------------------------------

function FieldRow({
  field,
  issues,
  canRemove,
  onChange,
  onRemove,
}: {
  field: DraftField;
  issues: FieldIssue[];
  canRemove: boolean;
  onChange: (patch: Partial<DraftField>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.uid });
  const issueFor = (which: FieldIssue["field"]) => issues.find((i) => i.field === which)?.message;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx(
        "rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950",
        isDragging && "opacity-60 shadow-lg"
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <button
          type="button"
          aria-label={`Reorder ${field.label || "field"}`}
          className="mt-1.5 cursor-grab touch-none rounded p-1 text-zinc-400 hover:text-zinc-700 active:cursor-grabbing dark:hover:text-zinc-200"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="min-w-[9rem] flex-1">
          <Input
            aria-label="Field label"
            value={field.label}
            placeholder="Label"
            onChange={(e) => {
              const label = e.target.value;
              // Before the first save the key tracks the label; afterwards it is frozen.
              onChange(field.locked ? { label } : { label, key: slugifyKey(label) });
            }}
          />
          {issueFor("label") && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{issueFor("label")}</p>}
        </div>

        <div className="min-w-[9rem] flex-1">
          <div className="relative">
            <Input
              aria-label="Field key"
              value={field.key}
              placeholder="key"
              disabled={field.locked}
              className="font-mono text-xs"
              onChange={(e) => onChange({ key: e.target.value })}
            />
            {field.locked && (
              <Lock className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
            )}
          </div>
          {field.locked ? (
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">Locked — entries already store values under this key.</p>
          ) : (
            issueFor("key") && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{issueFor("key")}</p>
          )}
        </div>

        <div className="min-w-[9rem]">
          <Select
            aria-label="Field type"
            value={field.type}
            onChange={(e) => {
              const type = e.target.value as CollectionFieldType;
              onChange({ type, options: type === "select" ? field.options ?? [] : undefined });
            }}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} · {t.hint}
              </option>
            ))}
          </Select>
        </div>

        <label className="mt-1.5 flex shrink-0 items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-600 dark:border-zinc-700"
          />
          Required
        </label>

        <IconButton
          label={`Remove ${field.label || "field"}`}
          disabled={!canRemove}
          className="mt-0.5 hover:text-red-600"
          onClick={() => {
            if (
              window.confirm(
                `Remove the "${field.label || field.key}" field? Existing values for this field will be hidden, not deleted.`
              )
            ) {
              onRemove();
            }
          }}
        >
          <X className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 pl-8">
        {field.type === "select" && (
          <div className="min-w-[14rem] flex-1">
            <Label>Options</Label>
            <OptionsInput value={field.options ?? []} onChange={(options) => onChange({ options })} />
            {issueFor("options") && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{issueFor("options")}</p>}
          </div>
        )}
        <div className="min-w-[14rem] flex-1">
          <Label>Help text</Label>
          <Input
            aria-label="Help text"
            value={field.help ?? ""}
            placeholder="Shown under the input"
            onChange={(e) => onChange({ help: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Collections() {
  const list = useToolQuery("collection.list", {});
  const invalidate = useInvalidateTool();
  const toast = useToast();

  const [slug, setSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPlural, setNewPlural] = useState("");

  const collections = list.data ?? [];
  const selected = collections.find((c) => c.slug === slug) ?? null;

  useEffect(() => {
    if (!list.data) return;
    if (slug === null && list.data.length > 0) setSlug(list.data[0]!.slug);
  }, [list.data, slug]);

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft(draftFrom(selected));
    setDirty(false);
    setShowIssues(false);
  }, [selected?.slug, list.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const issues = useMemo(() => (draft ? validateFields(draft.fields) : []), [draft]);

  const create = useToolMutation("collection.create", {
    onSuccess: (collection) => {
      toast.success(`${collection.name} created`);
      setNewOpen(false);
      setNewName("");
      setNewPlural("");
      setSlug(collection.slug);
      invalidate("collection.list");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const update = useToolMutation("collection.update", {
    onSuccess: () => {
      toast.success("Collection saved");
      setDirty(false);
      invalidate("collection.list");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useToolMutation("collection.delete", {
    onSuccess: () => {
      toast.success("Collection deleted");
      setSlug(null);
      invalidate("collection.list");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function patch(next: Partial<Draft>) {
    setDraft((cur) => (cur ? { ...cur, ...next } : cur));
    setDirty(true);
  }

  function patchField(uid: string, fieldPatch: Partial<DraftField>) {
    setDraft((cur) => (cur ? { ...cur, fields: cur.fields.map((f) => (f.uid === uid ? { ...f, ...fieldPatch } : f)) } : cur));
    setDirty(true);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!draft || !over || active.id === over.id) return;
    const from = draft.fields.findIndex((f) => f.uid === active.id);
    const to = draft.fields.findIndex((f) => f.uid === over.id);
    if (from < 0 || to < 0) return;
    const fields = draft.fields.slice();
    const [moved] = fields.splice(from, 1);
    fields.splice(to, 0, moved!);
    patch({ fields });
  }

  function save() {
    if (!draft || !selected) return;
    if (issues.length > 0) {
      setShowIssues(true);
      toast.error("Fix the highlighted fields first.");
      return;
    }
    const titleOptions = titleFieldOptions(draft.fields);
    const titleFieldKey = titleOptions.some((f) => f.key === draft.titleFieldKey)
      ? draft.titleFieldKey
      : titleOptions[0]?.key ?? draft.fields[0]!.key;
    update.mutate({
      slug: selected.slug,
      name: draft.name.trim(),
      namePlural: draft.namePlural.trim() || draft.name.trim(),
      icon: draft.icon.trim() || "database",
      public: draft.public,
      titleFieldKey,
      fields: draft.fields.map(toFieldInput),
    });
  }

  function destroy() {
    if (!selected) return;
    if (!window.confirm(`Delete the "${selected.name}" collection? This cannot be undone.`)) return;
    if (selected.entryCount > 0) {
      const plural = selected.entryCount === 1 ? "entry" : "entries";
      if (
        !window.confirm(
          `"${selected.name}" still has ${selected.entryCount} ${plural}. Deleting the collection deletes them too. Continue?`
        )
      ) {
        return;
      }
      remove.mutate({ slug: selected.slug, deleteEntries: true });
      return;
    }
    remove.mutate({ slug: selected.slug, deleteEntries: false });
  }

  const PreviewIcon = resolveIcon(draft?.icon);
  const titleOptions = draft ? titleFieldOptions(draft.fields) : [];

  return (
    <div>
      <PageHeader
        title="Collections"
        subtitle="Custom content types — events, products, team members…"
        actions={
          <Button variant="secondary" onClick={() => setNewOpen(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            New collection
          </Button>
        }
      />

      {list.isLoading && <Spinner />}
      {list.isError && <ErrorBanner message={errorMessage(list.error)} />}

      {list.data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <Card className="h-fit p-2">
            {collections.length === 0 ? (
              <p className="px-2 py-4 text-sm text-zinc-500 dark:text-zinc-400">No collections yet.</p>
            ) : (
              <div className="space-y-0.5">
                {collections.map((c) => {
                  const Icon = resolveIcon(c.icon);
                  return (
                    <button
                      key={c.slug}
                      type="button"
                      onClick={() => setSlug(c.slug)}
                      className={cx(
                        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium transition-colors",
                        c.slug === slug
                          ? "bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200"
                          : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                      )}
                    >
                      <span className="shrink-0 opacity-60" aria-hidden="true">
                        <Icon size={14} />
                      </span>
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="text-[10px] text-zinc-400">{c.entryCount}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {draft && selected ? (
            <div className="space-y-4">
              <Card className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[10rem] flex-1">
                    <Label htmlFor="collection-name">Name (singular)</Label>
                    <Input id="collection-name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
                  </div>
                  <div className="min-w-[10rem] flex-1">
                    <Label htmlFor="collection-plural">Name (plural)</Label>
                    <Input
                      id="collection-plural"
                      value={draft.namePlural}
                      placeholder={`${draft.name}s`}
                      onChange={(e) => patch({ namePlural: e.target.value })}
                    />
                  </div>
                  <div className="min-w-[9rem]">
                    <Label htmlFor="collection-icon">Icon</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="collection-icon"
                        value={draft.icon}
                        placeholder="database"
                        className="font-mono text-xs"
                        onChange={(e) => patch({ icon: e.target.value })}
                      />
                      <span
                        title={`lucide: ${draft.icon || "database"}`}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-300"
                      >
                        <PreviewIcon size={16} />
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">Any lucide icon name.</p>
                  </div>
                  <div className="min-w-[10rem]">
                    <Label>Slug</Label>
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 font-mono text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                      {selected.slug}
                    </div>
                  </div>
                </div>

                <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={draft.public}
                    onChange={(e) => patch({ public: e.target.checked })}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-600 dark:border-zinc-700"
                  />
                  <span>
                    Public
                    <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
                      Published entries appear on your site&apos;s API and can be shown with the Collection block.
                    </span>
                  </span>
                </label>
              </Card>

              <Card className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-semibold tracking-tight">Fields</h2>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => patch({ fields: [...draft.fields, newField()] })}>
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Add field
                    </Button>
                    <Button variant="primary" disabled={update.isPending || !dirty} onClick={save}>
                      {update.isPending ? "Saving…" : "Save collection"}
                    </Button>
                  </div>
                </div>

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={draft.fields.map((f) => f.uid)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {draft.fields.map((field, index) => (
                        <FieldRow
                          key={field.uid}
                          field={field}
                          issues={showIssues ? issues.filter((i) => i.index === index) : []}
                          canRemove={draft.fields.length > 1}
                          onChange={(fieldPatch) => patchField(field.uid, fieldPatch)}
                          onRemove={() => patch({ fields: draft.fields.filter((f) => f.uid !== field.uid) })}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>

                <div className="max-w-xs">
                  <Label htmlFor="collection-title-field">Title field</Label>
                  <Select
                    id="collection-title-field"
                    value={draft.titleFieldKey}
                    onChange={(e) => patch({ titleFieldKey: e.target.value })}
                  >
                    {titleOptions.length === 0 && <option value={draft.titleFieldKey}>No text field yet</option>}
                    {titleOptions.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label || f.key}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    Shown as each entry&apos;s name in lists. Text fields only.
                  </p>
                </div>
              </Card>

              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  Delete <strong>{selected.name}</strong>
                  {selected.entryCount > 0 && <> and its {selected.entryCount} entries</>}.
                </div>
                <Button variant="danger" size="sm" disabled={remove.isPending} onClick={destroy}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Delete collection
                </Button>
              </Card>
            </div>
          ) : (
            <Card className="p-0">
              <EmptyState
                icon={<Database className="h-5 w-5" />}
                title="No collection selected"
                description="Collections give you your own content types — events, products, team members — with typed fields."
                action={
                  <Button variant="primary" onClick={() => setNewOpen(true)}>
                    New collection
                  </Button>
                }
              />
            </Card>
          )}
        </div>
      )}

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New collection"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={create.isPending || !newName.trim()}
              onClick={() =>
                create.mutate({
                  slug: slugify(newPlural.trim() || `${newName.trim()}s`) || slugify(newName),
                  name: newName.trim(),
                  namePlural: newPlural.trim() || `${newName.trim()}s`,
                  icon: "database",
                  titleFieldKey: "title",
                  fields: [{ key: "title", label: "Title", type: "text", required: true }],
                })
              }
            >
              {create.isPending ? "Creating…" : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="new-collection-name">Name (singular)</Label>
            <Input
              id="new-collection-name"
              value={newName}
              placeholder="Team member"
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="new-collection-plural">Name (plural)</Label>
            <Input
              id="new-collection-plural"
              value={newPlural}
              placeholder={newName.trim() ? `${newName.trim()}s` : "Team members"}
              onChange={(e) => setNewPlural(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              Used in the sidebar. It starts with one <code>Title</code> text field — add the rest next.
            </p>
          </div>
          {create.isError && <ErrorBanner message={errorMessage(create.error)} />}
        </div>
      </Modal>
    </div>
  );
}
