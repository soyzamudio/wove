/**
 * AI over blocks: generate a whole page, generate one block, rewrite one block.
 * Every provider call goes through `meteredGenerate`, so these are metered, audited and
 * actor/channel-aware exactly like the Markdown AI tools.
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { Block, ToolCatalog, ToolDescriptions, type Post } from "@wove/sdk";
import { posts } from "../db/schema";
import { defineTool, notFound, ToolError, type Ctx } from "./registry";
import { postCreate } from "./content";
import { LooseBlock, LooseBlocksDoc } from "./blocks";
import { safeBlocks } from "./shared";
import {
  FIX_ERRORS_NUDGE, editBlockSystem, generateBlockSystem, generatePageSystem, parseJsonLoose,
} from "../ai/prompts";
import { meteredGenerate, openSession, type AiSession } from "../ai/run";

const D = ToolDescriptions;

const PAGE_MAX_TOKENS = 16000;

type Check<T> = (json: unknown) => { ok: true; value: T } | { ok: false; issues: string[] };

const zodIssues = (e: z.ZodError) =>
  e.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).slice(0, 20);

/** Run a schema-checked generation, retrying once with the validation errors fed back. */
async function generateJson<T>(
  ctx: Ctx,
  session: AiSession,
  tool: string,
  system: string,
  prompt: string,
  check: Check<T>,
): Promise<{ value: T; usage: { inputTokens: number; outputTokens: number } }> {
  const usage = { inputTokens: 0, outputTokens: 0 };

  const attempt = async (p: string) => {
    const res = await meteredGenerate(ctx, session, tool, { system, prompt: p });
    usage.inputTokens += res.usage.inputTokens;
    usage.outputTokens += res.usage.outputTokens;
    const json = parseJsonLoose(res.text);
    if (json === null) return { ok: false as const, issues: ["The response was not valid JSON."] };
    return check(json);
  };

  const first = await attempt(prompt);
  if (first.ok) return { value: first.value, usage };

  // Models fix their own schema errors surprisingly reliably when shown them verbatim.
  const second = await attempt(`${prompt}\n\n${FIX_ERRORS_NUDGE(first.issues)}`);
  if (second.ok) return { value: second.value, usage };

  throw new ToolError("validation_error", "The model did not return a valid block document.", {
    issues: second.issues,
  });
}

/** Existing structure of a page, so a new/edited block fits what is already there. */
function pageContext(ctx: Ctx, postId: string | undefined): string | null {
  if (!postId) return null;
  const row = ctx.db.select().from(posts).where(eq(posts.id, postId)).get();
  if (!row) throw notFound(`No post with id "${postId}"`);
  if (row.format !== "blocks") return `Page context — title: ${row.title} (Markdown page).`;
  const doc = safeBlocks(row);
  const summary = doc.blocks
    .map((b) => {
      const headline = (b.props as { headline?: string }).headline;
      return headline ? `${b.type} ("${headline}")` : b.type;
    })
    .join(", ");
  return `Page context — title: ${row.title}. Existing blocks: ${summary || "(none yet)"}. Match their tone and do not duplicate them.`;
}

// ---------------------------------------------------------------- ai.generatePage

const PageDraft = z.object({ title: z.string().min(1), doc: LooseBlocksDoc });

/** Accept `{title, blocks}` (what we ask for) as well as `{title, doc:{blocks}}` (what models drift to). */
function asPageDraft(json: unknown): { title: unknown; doc: unknown } {
  const o = (json ?? {}) as Record<string, unknown>;
  const inner = (o.doc ?? o.page ?? {}) as Record<string, unknown>;
  const blocks = Array.isArray(o.blocks) ? o.blocks : inner.blocks;
  return { title: o.title ?? inner.title, doc: { version: 1, blocks } };
}

export const aiGeneratePage = defineTool({
  name: "ai.generatePage",
  description: D["ai.generatePage"],
  input: ToolCatalog["ai.generatePage"].input,
  output: ToolCatalog["ai.generatePage"].output,
  scopes: ToolCatalog["ai.generatePage"].scopes,
  handler: async (ctx, input) => {
    const session = await openSession(ctx, PAGE_MAX_TOKENS);
    const system = generatePageSystem(session.system);
    const prompt = input.title ? `${input.prompt}\n\nThe page title is: ${input.title}` : input.prompt;

    const { value, usage } = await generateJson(ctx, session, "ai.generatePage", system, prompt, (json) => {
      const parsed = PageDraft.safeParse(asPageDraft(json));
      return parsed.success
        ? { ok: true as const, value: parsed.data }
        : { ok: false as const, issues: zodIssues(parsed.error) };
    });

    const title = input.title ?? value.title;
    let post: Post | null = null;
    if (input.save) {
      // Reuse post.create so hooks, slug de-duping and excerpt derivation behave identically.
      const createInput = postCreate.input.parse({
        type: "page",
        title,
        blocks: value.doc,
        status: "draft",
      });
      post = (await postCreate.handler(ctx, createInput)) as Post;
    }
    return { title, doc: value.doc, post, usage };
  },
});

// ---------------------------------------------------------------- ai.generateBlock

export const aiGenerateBlock = defineTool({
  name: "ai.generateBlock",
  description: D["ai.generateBlock"],
  input: ToolCatalog["ai.generateBlock"].input,
  output: ToolCatalog["ai.generateBlock"].output,
  scopes: ToolCatalog["ai.generateBlock"].scopes,
  handler: async (ctx, input) => {
    const session = await openSession(ctx);
    const system = generateBlockSystem(session.system, input.type, pageContext(ctx, input.postId));

    const { value, usage } = await generateJson<Block>(ctx, session, "ai.generateBlock", system, input.prompt, (json) => {
      const parsed = LooseBlock.safeParse(json);
      if (!parsed.success) return { ok: false as const, issues: zodIssues(parsed.error) };
      if (input.type && parsed.data.type !== input.type) {
        return { ok: false as const, issues: [`type: expected "${input.type}", received "${parsed.data.type}"`] };
      }
      return { ok: true as const, value: parsed.data };
    });

    return { block: value, usage };
  },
});

// ---------------------------------------------------------------- ai.editBlock

export const aiEditBlock = defineTool({
  name: "ai.editBlock",
  description: D["ai.editBlock"],
  input: ToolCatalog["ai.editBlock"].input,
  output: ToolCatalog["ai.editBlock"].output,
  scopes: ToolCatalog["ai.editBlock"].scopes,
  handler: async (ctx, input) => {
    const session = await openSession(ctx);
    const system = editBlockSystem(session.system, input.block, pageContext(ctx, input.postId));
    const prompt = [
      `Current block:\n${JSON.stringify(input.block)}`,
      "",
      `Instruction: ${input.instruction}`,
    ].join("\n");

    const { value, usage } = await generateJson<Block>(ctx, session, "ai.editBlock", system, prompt, (json) => {
      const parsed = LooseBlock.safeParse(json);
      if (!parsed.success) return { ok: false as const, issues: zodIssues(parsed.error) };
      if (parsed.data.type !== input.block.type) {
        return { ok: false as const, issues: [`type: must stay "${input.block.type}", received "${parsed.data.type}"`] };
      }
      // The block keeps its identity across the edit so the builder can swap it in place.
      return { ok: true as const, value: { ...parsed.data, id: input.block.id } as Block };
    });

    return { block: value, usage };
  },
});

export const aiPageTools = [aiGeneratePage, aiGenerateBlock, aiEditBlock];
