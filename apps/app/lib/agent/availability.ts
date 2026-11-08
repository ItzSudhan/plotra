import "server-only";
import { getProjectAccess, type ProjectAccess } from "../access";
import { billingEnabled } from "../billing/creem";
import { getCreditState } from "../billing/credits";
import { hasModule } from "../modules";
import { requestCache } from "../request-cache";
import { aiRemoved, workspaceAiPolicy } from "./no-ai";
import { hostedSettings, loadBrowserModel, loadModelSettings, modelSource } from "./settings";
import type { ModelSettings } from "./providers";
import { noAi, type AiState, type BrowserModel } from "./types";

// The one place that decides whether AI is on (plan.md 2.11 "Trust"): off
// until the workspace's owner turns it on, with a switch per project as
// well, and only for people who can edit. The project page uses it to decide
// what to render; the routes use it again before every run.

/**
 * The workspace's AI switch: on only when the owner turned it on, the
 * server hasn't taken AI out, and no promise of no AI stands (lib/agent/no-ai.ts).
 * Read with the server's own connection, and only after the caller has
 * established that the user can open one of the workspace's projects: a guest
 * editor isn't a workspace member, so row-level security would hide the row
 * from them, and the switch isn't a secret.
 */
export const workspaceAiEnabled = requestCache(async (workspaceId: string): Promise<boolean> => {
  if (aiRemoved()) return false;
  return (await workspaceAiPolicy(workspaceId)).enabled;
});

async function stateFor(access: ProjectAccess): Promise<AiState> {
  const removed = aiRemoved();
  const policy = removed ? null : await workspaceAiPolicy(access.project.organizationId);
  const forbidden = removed ? "server" : policy?.promise?.active ? "workspace" : null;
  const workspaceEnabled = !forbidden && (policy?.enabled ?? false);
  const projectEnabled = hasModule(access.project.type, access.project.settings, "ai");
  const enabled = workspaceEnabled && projectEnabled && access.actions.has("edit");
  // Nobody is told whether they have a key on a project where AI is off.
  const source = enabled ? await modelSource(access.project.organizationId) : null;
  // Their own model, on their own machine: the browser is told where it is, because the browser is what calls it.
  const browserModel = enabled ? await loadBrowserModel() : null;
  return { workspaceEnabled, projectEnabled, enabled, hasModel: source !== null, modelSource: source, browserModel, forbidden };
}

/** Whether AI is on for this project and this user, and whether they have a model to run it on. */
export async function getAiState(projectId: string): Promise<AiState> {
  const access = await getProjectAccess(projectId);
  return access ? stateFor(access) : noAi;
}

export type AiRun = {
  access: ProjectAccess;
  /** The model to run on, key decrypted: server only. */
  settings: ModelSettings;
};

/**
 * Why AI can't touch this project, whoever asks: the server took it out, the
 * workspace promised none, or a switch is off. Null when both switches are on.
 * Runs in the app and for AI assistants connected over MCP (lib/api/ai-gate.ts).
 */
export async function aiSwitchedOff(access: ProjectAccess): Promise<string | null> {
  if (aiRemoved()) return "AI isn't available on this server.";
  const policy = await workspaceAiPolicy(access.project.organizationId);
  if (policy.promise?.active) return "This workspace has promised no AI.";
  if (!policy.enabled) return "AI is switched off for this workspace.";
  if (!hasModule(access.project.type, access.project.settings, "ai")) return "AI is switched off for this project.";
  return null;
}

/** The switches and the right to edit, which every run needs whoever calls the model. */
async function requireSwitches(projectId: string): Promise<ProjectAccess> {
  const access = await getProjectAccess(projectId);
  if (!access) throw new Error("That project doesn't exist, or you can't open it.");
  if (!access.actions.has("edit")) throw new Error("Only people who can edit this project can use AI in it.");
  const off = await aiSwitchedOff(access);
  if (off) throw new Error(off);
  return access;
}

/** What a server route answers when asked to run on a model only the person's browser can reach. */
export const BROWSER_MODEL_MESSAGE = "Your model runs on your own machine, so your browser has to call it: this server can't reach it. Reload the page and try again.";

/**
 * Everything a run needs, or a message for the user saying why it can't
 * happen. Every route that calls a model starts here. A person whose own
 * model is called from their browser is refused: their choice of a local
 * model is not quietly replaced by one the server can reach.
 */
export async function requireAi(projectId: string): Promise<AiRun> {
  const access = await requireSwitches(projectId);
  if (await loadBrowserModel()) throw new Error(BROWSER_MODEL_MESSAGE);
  const workspaceId = access.project.organizationId;
  const settings = await loadModelSettings(workspaceId);
  if (!settings) throw new Error(await noModelMessage(workspaceId));
  return { access, settings };
}

export type BrowserAiRun = {
  access: ProjectAccess;
  /** The model the browser calls. The server never does. */
  model: BrowserModel;
};

/**
 * The same checks for a run whose model the browser calls (app/api/agent/local):
 * both switches on, the person can edit, and their own model really is one of
 * those. The routes that serve such a run start here, each time.
 */
export async function requireBrowserAi(projectId: string): Promise<BrowserAiRun> {
  const access = await requireSwitches(projectId);
  const model = await loadBrowserModel();
  if (!model) throw new Error("Your model isn't one this browser calls any more. Reload the page and try again.");
  return { access, model };
}

const day = new Intl.DateTimeFormat("en", { month: "long", day: "numeric", timeZone: "UTC" });

/** Why there is no model to run on, and what to do about it. */
async function noModelMessage(workspaceId: string): Promise<string> {
  const ownKey = "add your own AI key in Settings → AI";
  if (!billingEnabled() || !hostedSettings()) return "Add your AI key in Settings → AI first.";
  const credits = await getCreditState(workspaceId);
  if (credits) return `This workspace has used its ${credits.allowance.toLocaleString("en")} AI credits for this month. They come back on ${day.format(credits.resetsAt)}. Until then, ${ownKey}.`;
  return `To use AI here, ${ownKey}, or have the workspace's owner upgrade to Pro, which includes AI.`;
}
