import { streamText } from "ai";
import { unstable_rethrow } from "next/navigation";
import { requireAi } from "@/lib/agent/availability";
import { inlineOutputTokens, inlinePrompt, parseInlineRequest } from "@/lib/agent/inline";
import { describeModelError, modelFor, modelLabel } from "@/lib/agent/providers";
import { startRun, usageOf } from "@/lib/agent/runs";
import { prepareInline } from "@/lib/agent/turn";
import type { InlineEvent } from "@/lib/agent/types";
import { newBoundary } from "@/lib/agent/untrusted";
import { publicMessage } from "@/lib/errors";
import { readOnly } from "@/lib/request-cache";

// POST /api/agent/inline: the editor's inline actions (plan.md 2.11 "Inline in
// the editor"): continue, rewrite, shorten, expand, change tone. One short
// call on the person's "fast" model, no tools. The text streams back and the
// editor inserts it as an ordinary edit once the writer accepts it, so this
// route changes nothing itself.
//
// The response is newline-delimited JSON (`InlineEvent`): text as it comes,
// then either an error in plain words or the tokens the call used.

export const maxDuration = 120;

const fail = (message: string, status = 400) => new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function POST(request: Request) {
  // JSON only, so a cross-site form can't post here without a CORS preflight.
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("Not found", 404);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail("Bad request");
  }

  try {
    const input = parseInlineRequest(raw);
    // Who may run it, and that they can edit this note now (lib/agent/turn.ts).
    const { user, access, settings, title, brief } = await readOnly(() => prepareInline(input, requireAi));

    const label = modelLabel(settings, "fast");
    const run = await startRun({
      workspaceId: access.project.organizationId,
      projectId: input.projectId,
      threadId: null,
      userId: user.id,
      kind: "inline",
      // The text is offered to the writer, who accepts or discards it.
      mode: "suggest",
      model: label,
      hosted: settings.source === "hosted",
    });

    const { instructions, prompt } = inlinePrompt(input, { title, brief: brief?.text ?? null, boundary: newBoundary() });
    let result: ReturnType<typeof streamText>;
    try {
      result = streamText({
        model: modelFor(settings, "fast"),
        instructions,
        prompt,
        maxOutputTokens: inlineOutputTokens(input),
        maxRetries: 1,
        abortSignal: request.signal,
        // Errors are reported to the writer below. Without a handler the SDK logs them whole, request and all: the manuscript must not end up in server logs.
        onError: () => {},
      });
    } catch (error) {
      await run.finish("failed", undefined, describeModelError(error));
      return fail(describeModelError(error));
    }

    const encoder = new TextEncoder();
    const line = (event: InlineEvent) => encoder.encode(`${JSON.stringify(event)}\n`);
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const part of result.stream) {
            if (part.type === "text-delta") controller.enqueue(line({ t: "text", v: part.text }));
            else if (part.type === "error") {
              const message = describeModelError(part.error);
              await run.finish("failed", undefined, message);
              controller.enqueue(line({ t: "error", v: message }));
            } else if (part.type === "abort") await run.finish("stopped");
            else if (part.type === "finish") {
              const usage = usageOf(part.totalUsage);
              await run.finish("done", usage);
              controller.enqueue(line({ t: "done", ...usage }));
            }
          }
        } catch (error) {
          const message = describeModelError(error);
          await run.finish(request.signal.aborted ? "stopped" : "failed", undefined, message);
          if (!request.signal.aborted) controller.enqueue(line({ t: "error", v: message }));
        } finally {
          // A reader that went away has already closed it.
          try {
            controller.close();
          } catch {}
        }
      },
    });
    return new Response(body, {
      headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
    });
  } catch (error) {
    // notFound() and the sign-in redirect become plain answers for the caller.
    try {
      unstable_rethrow(error);
    } catch {
      return fail("That note doesn't exist, or you can't edit it.", 404);
    }
    return fail(publicMessage(error));
  }
}
