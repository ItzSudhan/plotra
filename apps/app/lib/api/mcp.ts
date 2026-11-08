import "server-only";
import type { ApiTokenScope } from "@plotra/db/schema";
import { describeError } from "./handler";
import { listAiProjects, requireAiProject } from "./ai-gate";
import { createableKindsText, createApiNote, listApiNotes, readApiNote, searchApiNotes, updateApiNote, writeApiNoteText } from "./notes";

// Plotra as an MCP server (beat-the-competitors.md step 9): Claude, Cursor or
// any other MCP client can read, search and write a person's projects with one
// of their API tokens. The Streamable HTTP transport, answering with plain
// JSON (no streaming: every tool answers at once). The tools are the API's
// (lib/api/notes.ts), so access is checked exactly as in the app. And an
// assistant is AI: it only sees and opens projects where AI is switched on
// (lib/api/ai-gate.ts).

export const SERVER_INFO = { name: "plotra", version: "1.0.0" };
const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

type Json = Record<string, unknown>;
type Tool = {
  name: string;
  description: string;
  inputSchema: Json;
  write?: boolean;
  run: (args: Json) => Promise<unknown>;
};

const str = (description: string) => ({ type: "string", description });
const object = (properties: Json, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });

const text = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !value) throw new Error(`${name} is required.`);
  return value;
};

/** The project a call is about, once it's established AI may open it. */
const aiProject = async (value: unknown): Promise<string> => {
  const projectId = text(value, "projectId");
  await requireAiProject(projectId);
  return projectId;
};

export const tools: Tool[] = [
  {
    name: "list_projects",
    description: "Lists the Plotra projects you can open where AI is switched on (novels, scripts, worlds…), with their ids.",
    inputSchema: object({}),
    run: async () => ({ projects: await listAiProjects() }),
  },
  {
    name: "list_notes",
    description: "Lists a project's notes in binder order: chapters, scenes, characters, places and the rest, with ids, kinds, parents, tags and word counts. No text: use read_note for that.",
    inputSchema: object({ projectId: str("The project's id, from list_projects.") }, ["projectId"]),
    run: async (args) => ({ notes: await listApiNotes(await aiProject(args.projectId)) }),
  },
  {
    name: "read_note",
    description: "Reads one note: what's known about it, and its text as Markdown. [[Title]] is a link to another note.",
    inputSchema: object({ projectId: str("The project's id."), noteId: str("The note's id, from list_notes or search.") }, ["projectId", "noteId"]),
    run: async (args) => {
      const noteId = text(args.noteId, "noteId");
      return { note: await readApiNote(await aiProject(args.projectId), noteId) };
    },
  },
  {
    name: "search",
    description: 'Full-text search in a project, best first. Web-search syntax: words are all required, "quoted phrases", or, -excluded.',
    inputSchema: object({ projectId: str("The project's id."), query: str("What to look for."), limit: { type: "number", description: "At most this many (1–50, default 20)." } }, ["projectId", "query"]),
    run: async (args) => {
      const query = text(args.query, "query");
      return { hits: await searchApiNotes(await aiProject(args.projectId), query, typeof args.limit === "number" ? args.limit : 20) };
    },
  },
  {
    name: "create_note",
    description: `Makes a note from Markdown, at the end of the project or inside a folder or chapter. [[Title]] links to the note of that title. kind is one of: ${createableKindsText}.`,
    inputSchema: object(
      {
        projectId: str("The project's id."),
        title: str("The note's title."),
        kind: str(`One of: ${createableKindsText}. Default note.`),
        parentId: str("Put it inside this folder or chapter (an id from list_notes). Leave out for the top of the project."),
        markdown: str("The note's text, in Markdown."),
        synopsis: str("A line or two on what it is."),
        tags: { type: "array", items: { type: "string" }, description: "Tags." },
      },
      ["projectId", "title"],
    ),
    write: true,
    run: async (args) => {
      const { projectId, ...input } = args;
      return { note: await createApiNote(await aiProject(projectId), input as Parameters<typeof createApiNote>[1]) };
    },
  },
  {
    name: "update_note",
    description: "Changes what's known about a note: title, synopsis, tags, aliases or status. Not its text: use write_note_text for that.",
    inputSchema: object(
      {
        projectId: str("The project's id."),
        noteId: str("The note's id."),
        title: str("A new title."),
        synopsis: str("A new synopsis."),
        tags: { type: "array", items: { type: "string" }, description: "Its tags, all of them." },
        aliases: { type: "array", items: { type: "string" }, description: "Other names it goes by, all of them." },
        status: str("A status id from the project's workflow."),
      },
      ["projectId", "noteId"],
    ),
    write: true,
    run: async (args) => {
      const { projectId, noteId, ...patch } = args;
      const id = text(noteId, "noteId");
      return { note: await updateApiNote(await aiProject(projectId), id, patch) };
    },
  },
  {
    name: "write_note_text",
    description:
      "Writes a note's text, live: anyone with it open sees the change. append adds Markdown to the end; replace rewrites the whole note (what was there is kept in its history). With suggest: true the change arrives as tracked changes for the writer to accept or reject: use it for anything they didn't ask for word for word.",
    inputSchema: object(
      {
        projectId: str("The project's id."),
        noteId: str("The note's id."),
        mode: { type: "string", enum: ["append", "replace"] },
        markdown: str("The text, in Markdown. One paragraph per line."),
        suggest: { type: "boolean", description: "Write as suggestions instead of changing the text outright." },
      },
      ["projectId", "noteId", "mode", "markdown"],
    ),
    write: true,
    run: async (args) => {
      const noteId = text(args.noteId, "noteId");
      const markdown = text(args.markdown, "markdown");
      return writeApiNoteText(await aiProject(args.projectId), noteId, { mode: args.mode as "append" | "replace", markdown, suggest: args.suggest === true });
    },
  },
];

const visible = (scope: ApiTokenScope) => tools.filter((tool) => scope === "write" || !tool.write);

type Request = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Json };
type Reply = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

const ok = (id: Request["id"], result: unknown): Reply => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: Request["id"], code: number, message: string): Reply => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** One JSON-RPC message. Null for a notification, which gets no reply. */
export async function handleMessage(message: Request, scope: ApiTokenScope): Promise<Reply | null> {
  if (!message || typeof message !== "object" || message.jsonrpc !== "2.0" || typeof message.method !== "string") return fail(null, -32600, "Invalid request.");
  const isNotification = message.id === undefined;
  if (isNotification) return null;
  const params = (message.params ?? {}) as Json;
  switch (message.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return ok(message.id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Plotra is a writing app: projects hold notes (chapters, scenes, characters, places, research). Find a project with list_projects, its notes with list_notes or search, then read_note. Only projects where AI is switched on are open to you: if one is missing, its workspace owner can switch AI on in the workspace's Settings → AI. Prefer suggest: true when writing text the writer didn't dictate.",
      });
    }
    case "ping":
      return ok(message.id, {});
    case "tools/list":
      return ok(message.id, { tools: visible(scope).map(({ name, description, inputSchema, write }) => ({ name, description, inputSchema, annotations: { readOnlyHint: !write } })) });
    case "tools/call": {
      const tool = tools.find((t) => t.name === params.name);
      if (!tool) return fail(message.id, -32602, `No tool called ${String(params.name)}.`);
      if (tool.write && scope !== "write") return ok(message.id, { isError: true, content: [{ type: "text", text: "This connection can only read. Connect again and allow changes, or make a token that can write in Plotra's Settings → API tokens." }] });
      try {
        const result = await tool.run((params.arguments ?? {}) as Json);
        return ok(message.id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result });
      } catch (error) {
        // A tool's failure is the model's to read and work around, not a protocol error.
        return ok(message.id, { isError: true, content: [{ type: "text", text: describeError(error).message }] });
      }
    }
    default:
      return fail(message.id, -32601, `Unknown method ${message.method}.`);
  }
}
