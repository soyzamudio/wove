import type { BlockType } from "@wove/sdk";

/**
 * Tiny abstract wireframe of what a block looks like. Pure CSS shapes — no
 * images — so the picker stays fast and themable.
 */
const BAR = "rounded-[2px] bg-zinc-300 dark:bg-zinc-600";
const ACCENT = "rounded-[2px] bg-blue-500/70";
const BOX = "rounded-[3px] bg-zinc-200 dark:bg-zinc-700";

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-1">{children}</div>;
}

function shapes(type: BlockType) {
  switch (type) {
    case "hero":
      return (
        <div className="flex h-full gap-1.5">
          <div className="flex flex-1 flex-col justify-center gap-1">
            <div className={`${BAR} h-1.5 w-3/4`} />
            <div className={`${BAR} h-1 w-full opacity-60`} />
            <div className={`${ACCENT} mt-0.5 h-2 w-1/2`} />
          </div>
          <div className={`${BOX} h-full w-2/5`} />
        </div>
      );
    case "features":
      return (
        <div className="flex h-full flex-col justify-center gap-1.5">
          <div className={`${BAR} mx-auto h-1.5 w-1/2`} />
          <Row>
            {[0, 1, 2].map((i) => (
              <div key={i} className={`${BOX} h-6 flex-1`} />
            ))}
          </Row>
        </div>
      );
    case "markdown":
      return (
        <div className="flex h-full flex-col justify-center gap-1">
          <div className={`${BAR} h-1.5 w-1/2`} />
          {[100, 95, 88, 60].map((w, i) => (
            <div key={i} className={`${BAR} h-1 opacity-60`} style={{ width: `${w}%` }} />
          ))}
        </div>
      );
    case "image":
      return <div className={`${BOX} h-full w-full`} />;
    case "gallery":
      return (
        <div className="grid h-full grid-cols-3 grid-rows-2 gap-1">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={BOX} />
          ))}
        </div>
      );
    case "cta":
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1 rounded-[4px] bg-zinc-100 dark:bg-zinc-800">
          <div className={`${BAR} h-1.5 w-1/2`} />
          <div className={`${ACCENT} h-2 w-1/3`} />
        </div>
      );
    case "testimonials":
      return (
        <Row>
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-1 flex-col gap-1 rounded-[3px] bg-zinc-100 p-1 dark:bg-zinc-800">
              <div className={`${BAR} h-1 w-full opacity-60`} />
              <div className={`${BAR} h-1 w-4/5 opacity-60`} />
              <div className="mt-auto flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                <div className={`${BAR} h-1 w-1/2`} />
              </div>
            </div>
          ))}
        </Row>
      );
    case "logos":
      return (
        <div className="flex h-full items-center gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${BAR} h-2.5 flex-1 opacity-70`} />
          ))}
        </div>
      );
    case "faq":
      return (
        <div className="flex h-full flex-col justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-1">
              <div className={`${BAR} h-1.5 flex-1`} />
              <div className="h-1.5 w-1.5 rotate-45 border-b border-r border-zinc-400" />
            </div>
          ))}
        </div>
      );
    case "stats":
      return (
        <Row>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className={`${ACCENT} h-3 w-3/4`} />
              <div className={`${BAR} h-1 w-full opacity-60`} />
            </div>
          ))}
        </Row>
      );
    case "columns":
      return (
        <Row>
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-1 flex-col gap-1">
              <div className={`${BAR} h-1.5 w-3/4`} />
              {[100, 90, 70].map((w, j) => (
                <div key={j} className={`${BAR} h-1 opacity-60`} style={{ width: `${w}%` }} />
              ))}
            </div>
          ))}
        </Row>
      );
    case "html":
      return (
        <div className="flex h-full items-center justify-center rounded-[4px] border border-dashed border-zinc-300 font-mono text-[10px] text-zinc-400 dark:border-zinc-600">
          &lt;/&gt;
        </div>
      );
    default:
      return null;
  }
}

export function BlockThumb({ type }: { type: BlockType }) {
  return (
    <div className="h-12 w-full overflow-hidden rounded-md bg-white p-1.5 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
      {shapes(type)}
    </div>
  );
}
