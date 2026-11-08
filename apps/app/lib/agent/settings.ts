import "server-only";
import { schema } from "@plotra/db";
import type { AiProvider } from "@plotra/db/schema";
import { eq } from "drizzle-orm";
import { getCreditState } from "../billing/credits";
import { billingEnabled } from "../billing/creem";
import { requireSession } from "../data";
import { userDb } from "../db";
import { requestCache } from "../request-cache";
import { privateUrlsAllowed } from "./base-url";
import { decryptKey, keysConfigured, lastFour } from "./keys";
import { baseUrlFor, browserModelOf, isBrowserLocal, isProvider, type ModelSettings } from "./providers";
import { providerMeta, type BrowserModel } from "./types";

// Whose model a run uses (plan.md 2.11 "Whose model"): the person's own key
// and models if they saved any; otherwise, in a Pro workspace with credits
// left, the model the server was given in env (lib/billing/credits.ts). On a
// server without plans (self-hosting), that same model is everyone's.

const { aiKey } = schema;

/** The server's own model, from the `AI_` env vars. */
function envSettings(source: "instance" | "hosted"): ModelSettings | null {
  const env = (name: string) => process.env[`AI_${name}`]?.trim() ?? "";
  const provider = env("PROVIDER").toLowerCase();
  if (!provider || !isProvider(provider)) return null;
  const agentModel = env("MODEL_AGENT");
  const fastModel = env("MODEL_FAST") || agentModel;
  if (!agentModel) return null;
  const apiKey = env("API_KEY") || null;
  if (providerMeta[provider].key === "required" && !apiKey) return null;
  const baseUrl = env("BASE_URL") || null;
  if (provider === "compatible" && !baseUrl) return null;
  return { provider, baseUrl, apiKey, agentModel, fastModel, source };
}

/** The server's model as everyone's, on a server without plans: self-hosters whose users shouldn't each need a key. */
export const instanceSettings = (): ModelSettings | null => (billingEnabled() ? null : envSettings("instance"));

/** The server's model as the one Pro workspaces run on, where there are plans: paid for by Plotra and counted in credits. */
export const hostedSettings = (): ModelSettings | null => (billingEnabled() ? envSettings("hosted") : null);

/** The hosted model, if this workspace may use it right now: it is Pro and has credits left this month. */
async function hostedFor(workspaceId: string | undefined): Promise<ModelSettings | null> {
  if (!workspaceId) return null;
  const hosted = hostedSettings();
  if (!hosted) return null;
  const credits = await getCreditState(workspaceId);
  return credits && credits.left > 0 ? hosted : null;
}

type KeyRow = typeof aiKey.$inferSelect;

/** The signed-in user's own row. Row-level security shows nobody else's. */
const ownRow = requestCache(async (): Promise<KeyRow | null> => {
  const { user } = await requireSession();
  const [row] = await userDb((tx) => tx.select().from(aiKey).where(eq(aiKey.userId, user.id)).limit(1));
  return row ?? null;
});

/** Why a saved row can't be used as it stands, if it can't. */
function unusable(row: KeyRow): string | null {
  if (!keysConfigured()) return "This server isn't set up for personal AI keys.";
  const url = baseUrlFor({ provider: row.provider, baseUrl: row.baseUrl });
  if (providerMeta[row.provider].baseUrl && url) {
    try {
      new URL(url);
    } catch {
      return "The saved URL isn't valid.";
    }
  }
  return null;
}

/**
 * The current user's own model, when it is one their browser has to call: a
 * local or private address on a server that can't reach it (plan.md 2.11
 * "Local model"). Null for every model the server calls itself. Such a model
 * is never called from here, and no key is kept for it.
 */
export async function loadBrowserModel(): Promise<BrowserModel | null> {
  const row = await ownRow();
  return row && !unusable(row) && isBrowserLocal(row) ? browserModelOf(row) : null;
}

/**
 * The model settings to run the current user's requests with, key decrypted.
 * Their own settings win; then the hosted model, for a run in a Pro workspace
 * (`workspaceId`); then the instance's. Null when there is none of these.
 * The result holds a plain key: it must never leave the server or be logged.
 */
export async function loadModelSettings(workspaceId?: string): Promise<ModelSettings | null> {
  const { user } = await requireSession();
  const row = await ownRow();
  // A model the browser calls is not one the server can run on: callers check `loadBrowserModel` first.
  if (row && !unusable(row) && !isBrowserLocal(row)) {
    try {
      const apiKey = row.encryptedKey ? decryptKey(row.encryptedKey, user.id) : null;
      if (apiKey || providerMeta[row.provider].key === "optional") {
        return { provider: row.provider, baseUrl: row.baseUrl, apiKey, agentModel: row.agentModel, fastModel: row.fastModel, source: "user" };
      }
    } catch {
      // A key that can't be decrypted (the secret changed) isn't a key: fall through to the next one.
    }
  }
  return (await hostedFor(workspaceId)) ?? instanceSettings();
}

/** Whether the current user has a model to run on, and whose it is, without decrypting anything. */
export async function modelSource(workspaceId?: string): Promise<ModelSettings["source"] | null> {
  const row = await ownRow();
  if (row && !unusable(row) && (row.encryptedKey || providerMeta[row.provider].key === "optional" || isBrowserLocal(row))) return "user";
  if (await hostedFor(workspaceId)) return "hosted";
  return instanceSettings() ? "instance" : null;
}

/** What Settings → AI shows. The key itself is never part of it: only its last four characters. */
export type AiSettingsView = {
  /** AI_KEY_SECRET is set: people can save their own key. */
  byokAvailable: boolean;
  /** This server may call private addresses (self-hosting), so it calls local models itself. Otherwise the browser does. */
  privateUrlsAllowed: boolean;
  /** The instance-wide model, when there is one. Never its key. */
  instance: { provider: AiProvider; agentModel: string; fastModel: string } | null;
  saved: {
    provider: AiProvider;
    baseUrl: string | null;
    hasKey: boolean;
    /** Empty when the saved key can no longer be decrypted. */
    keyLastFour: string;
    keyReadable: boolean;
    agentModel: string;
    fastModel: string;
    /** The saved model is on the person's own machine or network: their browser calls it, and its key (if any) is kept there. */
    browser: boolean;
    /** Set when the saved settings can't be used as they are. */
    problem: string | null;
  } | null;
};

export async function getAiSettingsView(): Promise<AiSettingsView> {
  const { user } = await requireSession();
  const row = await ownRow();
  const instance = instanceSettings();
  let keyLastFour = "";
  let keyReadable = true;
  if (row?.encryptedKey) {
    try {
      keyLastFour = lastFour(decryptKey(row.encryptedKey, user.id));
    } catch {
      keyReadable = false;
    }
  }
  return {
    byokAvailable: keysConfigured(),
    privateUrlsAllowed: privateUrlsAllowed(),
    instance: instance && { provider: instance.provider, agentModel: instance.agentModel, fastModel: instance.fastModel },
    saved: row && {
      provider: row.provider,
      baseUrl: row.baseUrl,
      hasKey: Boolean(row.encryptedKey),
      keyLastFour,
      keyReadable,
      agentModel: row.agentModel,
      fastModel: row.fastModel,
      browser: !unusable(row) && isBrowserLocal(row),
      problem: unusable(row) ?? (keyReadable ? null : "The saved key can't be read any more. Enter it again."),
    },
  };
}
