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
import { GripVertical, IndentDecrease, IndentIncrease, Link2, Menu as MenuIcon, Plus, Trash2, X } from "lucide-react";
import type { Menu } from "@agentpress/sdk";
import { useInvalidateTool, useToolMutation, useToolQuery } from "../api";
import { slugify } from "../lib/slug";
import { useToast } from "../context/ToastContext";
import { flatten, indent, move, newItemId, outdent, remove, unflatten, updateItem, type FlatMenuItem } from "../lib/menuTree";
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
  Spinner,
  cx,
  errorMessage,
} from "../components/ui";

const BUILT_IN = new Set(["header", "footer"]);

// ---------------------------------------------------------------------------
// One draggable row
// ---------------------------------------------------------------------------

function ItemRow({
  item,
  canIndent,
  onChange,
  onIndent,
  onOutdent,
  onRemove,
}: {
  item: FlatMenuItem;
  canIndent: boolean;
  onChange: (patch: Partial<FlatMenuItem>) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx(
        "flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950",
        item.depth === 1 && "ml-8",
        isDragging && "opacity-60 shadow-lg"
      )}
    >
      <button
        type="button"
        aria-label={`Reorder ${item.label}`}
        className="cursor-grab touch-none rounded p-1 text-zinc-400 hover:text-zinc-700 active:cursor-grabbing dark:hover:text-zinc-200"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <Input
        aria-label="Label"
        value={item.label}
        placeholder="Label"
        className="flex-1"
        onChange={(e) => onChange({ label: e.target.value })}
      />
      <Input
        aria-label="Link"
        value={item.href}
        placeholder="/path"
        className="flex-1 font-mono text-xs"
        onChange={(e) => onChange({ href: e.target.value })}
      />

      <IconButton label="Nest under the item above" disabled={!canIndent || item.depth === 1} onClick={onIndent}>
        <IndentIncrease className="h-4 w-4" />
      </IconButton>
      <IconButton label="Move out one level" disabled={item.depth === 0} onClick={onOutdent}>
        <IndentDecrease className="h-4 w-4" />
      </IconButton>
      <IconButton label={`Remove ${item.label}`} onClick={onRemove} className="hover:text-red-600">
        <X className="h-4 w-4" />
      </IconButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-item picker: published content or a custom URL
// ---------------------------------------------------------------------------

function AddItemModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (label: string, href: string) => void }) {
  const pages = useToolQuery("post.list", { type: "page", status: "published", limit: 50 }, { enabled: open });
  const posts = useToolQuery("post.list", { type: "post", status: "published", limit: 50 }, { enabled: open });
  const [label, setLabel] = useState("");
  const [href, setHref] = useState("");

  useEffect(() => {
    if (open) {
      setLabel("");
      setHref("");
    }
  }, [open]);

  const options = useMemo(
    () => [
      ...(pages.data?.items ?? []).map((p) => ({ id: p.id, title: p.title, slug: p.slug, kind: "Page" })),
      ...(posts.data?.items ?? []).map((p) => ({ id: p.id, title: p.title, slug: p.slug, kind: "Post" })),
    ],
    [pages.data, posts.data]
  );

  return (
    <Modal open={open} onClose={onClose} title="Add menu item" className="max-w-lg">
      <div className="space-y-4">
        <div>
          <Label>Published content</Label>
          {pages.isLoading || posts.isLoading ? (
            <Spinner />
          ) : options.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Nothing published yet — add a custom link below.</p>
          ) : (
            <div className="ap-scroll max-h-56 space-y-1 overflow-y-auto">
              {options.map((o) => (
                <button
                  key={o.kind + o.id}
                  type="button"
                  onClick={() => {
                    onAdd(o.title || o.slug, `/${o.slug}`);
                    onClose();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                  <span className="flex-1 truncate">{o.title || "(untitled)"}</span>
                  <span className="font-mono text-xs text-zinc-400">/{o.slug}</span>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-400">{o.kind}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Link2 className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
            Custom link
          </div>
          <Input value={label} placeholder="Label" onChange={(e) => setLabel(e.target.value)} />
          <Input value={href} placeholder="https://example.com or /path" onChange={(e) => setHref(e.target.value)} />
          <Button
            variant="primary"
            size="sm"
            disabled={!label.trim() || !href.trim()}
            onClick={() => {
              onAdd(label.trim(), href.trim());
              onClose();
            }}
          >
            Add link
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Menus() {
  const menus = useToolQuery("menu.list", {});
  const invalidate = useInvalidateTool();
  const toast = useToast();

  const [location, setLocation] = useState<string | null>(null);
  const [items, setItems] = useState<FlatMenuItem[]>([]);
  const [name, setName] = useState("");
  const [dirty, setDirty] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [locationTouched, setLocationTouched] = useState(false);

  const list: Menu[] = menus.data ?? [];
  const selected = list.find((m) => m.location === location) ?? null;

  // Select the first menu once loaded, and load the selected one into the editor.
  useEffect(() => {
    if (!menus.data) return;
    if (location === null && menus.data.length > 0) setLocation(menus.data[0]!.location);
  }, [menus.data, location]);

  useEffect(() => {
    if (!selected) return;
    setItems(flatten(selected.items));
    setName(selected.name);
    setDirty(false);
  }, [selected?.location, menus.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useToolMutation("menu.set", {
    onSuccess: () => {
      toast.success("Menu saved");
      setDirty(false);
      invalidate("menu.list");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const del = useToolMutation("menu.delete", {
    onSuccess: () => {
      toast.success("Menu deleted");
      setLocation(null);
      invalidate("menu.list");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function apply(next: FlatMenuItem[]) {
    setItems(next);
    setDirty(true);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    apply(move(items, String(active.id), String(over.id)));
  }

  function createMenu() {
    const loc = slugify(locationTouched ? newLocation : newName);
    if (!loc) return;
    save.mutate(
      { location: loc, name: newName.trim() || loc, items: [] },
      {
        onSuccess: () => {
          setNewOpen(false);
          setNewName("");
          setNewLocation("");
          setLocationTouched(false);
          setLocation(loc);
          invalidate("menu.list");
        },
      }
    );
  }

  const ids = useMemo(() => items.map((i) => i.id), [items]);

  return (
    <div>
      <PageHeader
        title="Menus"
        subtitle="Navigation shown on your site"
        actions={
          <Button variant="secondary" onClick={() => setNewOpen(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            New menu
          </Button>
        }
      />

      {menus.isLoading && <Spinner />}
      {menus.isError && <ErrorBanner message={errorMessage(menus.error)} />}

      {menus.data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <Card className="h-fit p-2">
            {list.length === 0 ? (
              <p className="px-2 py-4 text-sm text-zinc-500 dark:text-zinc-400">No menus yet.</p>
            ) : (
              <div className="space-y-0.5">
                {list.map((m) => (
                  <button
                    key={m.location}
                    type="button"
                    onClick={() => setLocation(m.location)}
                    className={cx(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium transition-colors",
                      m.location === location
                        ? "bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200"
                        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    )}
                  >
                    <MenuIcon className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
                    <span className="flex-1 truncate">{m.name}</span>
                    <span className="text-[10px] text-zinc-400">{m.items.length}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          {selected ? (
            <div className="space-y-4">
              <Card className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[12rem] flex-1">
                    <Label htmlFor="menu-name">Menu name</Label>
                    <Input
                      id="menu-name"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setDirty(true);
                      }}
                    />
                  </div>
                  <div className="min-w-[10rem]">
                    <Label>Location</Label>
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 font-mono text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                      {selected.location}
                    </div>
                  </div>
                  <Button variant="secondary" onClick={() => setAddOpen(true)}>
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Add item
                  </Button>
                  <Button variant="primary" disabled={save.isPending || !dirty} onClick={() => save.mutate({ location: selected.location, name, items: unflatten(items) })}>
                    {save.isPending ? "Saving…" : "Save menu"}
                  </Button>
                </div>

                {items.length === 0 ? (
                  <EmptyState
                    icon={<MenuIcon className="h-5 w-5" />}
                    title="This menu is empty"
                    description="Add pages, posts or custom links, then drag to reorder."
                    action={
                      <Button variant="primary" onClick={() => setAddOpen(true)}>
                        Add item
                      </Button>
                    }
                  />
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                      <div className="space-y-1.5">
                        {items.map((item, index) => (
                          <ItemRow
                            key={item.id}
                            item={item}
                            canIndent={index > 0 && items[index - 1]!.depth === 0 && items[index + 1]?.depth !== 1}
                            onChange={(patch) => apply(updateItem(items, item.id, patch))}
                            onIndent={() => apply(indent(items, item.id))}
                            onOutdent={() => apply(outdent(items, item.id))}
                            onRemove={() => apply(remove(items, item.id))}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </Card>

              {!BUILT_IN.has(selected.location) && (
                <Card className="flex items-center justify-between gap-3">
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">
                    Delete the <strong>{selected.name}</strong> menu and its items.
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={del.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete the "${selected.name}" menu? This cannot be undone.`)) {
                        del.mutate({ location: selected.location });
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Delete menu
                  </Button>
                </Card>
              )}
            </div>
          ) : (
            <Card className="p-0">
              <EmptyState
                icon={<MenuIcon className="h-5 w-5" />}
                title="No menu selected"
                description="Create a menu to control your site navigation."
                action={
                  <Button variant="primary" onClick={() => setNewOpen(true)}>
                    New menu
                  </Button>
                }
              />
            </Card>
          )}
        </div>
      )}

      <AddItemModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(label, href) => apply([...items, { id: newItemId(), label, href, depth: 0 }])}
      />

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New menu"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={save.isPending || !newName.trim()} onClick={createMenu}>
              {save.isPending ? "Creating…" : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="new-menu-name">Name</Label>
            <Input id="new-menu-name" value={newName} placeholder="Footer legal" onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="new-menu-location">Location slug</Label>
            <Input
              id="new-menu-location"
              value={locationTouched ? newLocation : slugify(newName)}
              placeholder="footer-legal"
              className="font-mono"
              onChange={(e) => {
                setLocationTouched(true);
                setNewLocation(e.target.value);
              }}
            />
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              Themes render a menu by its location, e.g. <code>header</code>.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
