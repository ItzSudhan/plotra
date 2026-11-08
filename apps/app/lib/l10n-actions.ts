"use server";

import { schema } from "@plotra/db";
import { glossaryRules, translationStatuses, type GlossaryRule, type TranslationStatus } from "@plotra/db/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { requireNodeAccess, requireProjectAccess } from "./access";
import { listNodes } from "./binder";
import { ydocToValue } from "./collab/ydoc";
import { requireSession } from "./data";
import { userDb } from "./db";
import type { DocNode } from "./doc-index";
import { getProjectStrings } from "./interactive-actions";
import { documentUnits, hashText, type ImportedRow, type Term, type TranslationRow, type Unit } from "./l10n";
import { rateLimit } from "./rate-limit";
import { readOnly, transaction } from "./request-cache";
import { isDocumentKind } from "./story";
import { flatten, indexNodes } from "./tree";

// Localization (plan.md 2.8): translations of document blocks and strings,
// one row per unit per language, and the glossary. Source text is read from
// the documents as last synced; a translation remembers the hash of the source
// it was made from, so a later change to the source shows as stale.

const { node, translation, glossaryTerm } = schema;

const MAX_TEXT = 20_000;
const MAX_DOCUMENTS = 300;
const MAX_IMPORT = 5000;
const UNIT_KEY = /^(str:[A-Za-z0-9_.-]{1,120}|[A-Za-z0-9-]{1,64}:[A-Za-z0-9_-]{1,64})$/;

/** What to translate: the project's strings, or the documents under a folder (null = the whole project). */
export type TranslationScope = { strings: true } | { rootId: string | null };

export type TranslationUnits = {
  units: Unit[];
  translations: TranslationRow[];
  /** Set when the scope has more documents than are loaded at once. */
  truncated: boolean;
};

function assertLocale(settings: { locales?: string[] }, locale: string) {
  if (!settings.locales?.includes(locale)) throw new Error("Add that language in project settings first.");
}

/** The units of a scope, and what's been translated of them in one language. */
export async function getTranslationUnits(projectId: string, scope: TranslationScope, locale: string): Promise<TranslationUnits> {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    let units: Unit[];
    let truncated = false;

    if ("strings" in scope) {
      units = (await getProjectStrings(projectId)).map((s) => ({
        key: `str:${s.key}`,
        source: s.text,
        context: s.context ?? undefined,
        nodeId: s.nodeId ?? undefined,
        speaker: s.speaker ?? undefined,
        charLimit: s.charLimit,
      }));
    } else {
      if (scope.rootId) await requireNodeAccess(projectId, scope.rootId);
      const index = indexNodes(await listNodes(projectId));
      const root = scope.rootId ? index.byId.get(scope.rootId) : undefined;
      // A folder that's gone to the trash has nothing left to translate, rather than the whole project.
      const gone = Boolean(scope.rootId) && (!root || Boolean(root.deletedAt));
      const documents = (gone ? [] : root ? [root, ...flatten(index, root.id)] : flatten(index)).filter((n) => isDocumentKind(n.kind) && n.wordCount > 0);
      truncated = documents.length > MAX_DOCUMENTS;
      const picked = documents.slice(0, MAX_DOCUMENTS);
      const rows = picked.length
        ? await userDb((tx) =>
            tx
              .select({ id: node.id, ydoc: node.ydoc, content: node.content })
              .from(node)
              .where(inArray(node.id, picked.map((n) => n.id))),
          )
        : [];
      const bodies = new Map(rows.map((r) => [r.id, r.ydoc?.length ? ydocToValue(r.ydoc) : Array.isArray(r.content) ? (r.content as DocNode[]) : []]));
      const titleOf = (id: string) => index.byId.get(id)?.title;
      units = picked.flatMap((n) => documentUnits(n.id, n.title, bodies.get(n.id) ?? [], titleOf));
    }

    const keys = units.map((u) => u.key);
    const translations: TranslationRow[] = [];
    for (let i = 0; i < keys.length; i += 500) {
      translations.push(
        ...(await userDb((tx) =>
          tx
            .select({ unitKey: translation.unitKey, text: translation.text, status: translation.status, sourceHash: translation.sourceHash })
            .from(translation)
            .where(and(eq(translation.projectId, projectId), eq(translation.locale, locale), inArray(translation.unitKey, keys.slice(i, i + 500)))),
        )),
      );
    }
    return { units, translations, truncated };
  });
}

/**
 * Saves one unit's translation. `source` is the text it was translated from.
 * Without `text` only the status changes, so a status picked while a typed
 * translation is still on its way can't put the old text back.
 */
export async function saveTranslation(
  projectId: string,
  input: { unitKey: string; locale: string; text?: string; status?: TranslationStatus; source: string },
): Promise<TranslationRow> {
  return transaction(async () => {
    const { user } = await requireSession();
    const { project } = await requireProjectAccess(projectId, "edit");
    assertLocale(project.settings, input.locale);
    if (!UNIT_KEY.test(input.unitKey)) throw new Error("Unknown unit.");
    if (input.status !== undefined && !translationStatuses.includes(input.status)) throw new Error("Unknown status.");
    if (input.text === undefined && input.status === undefined) throw new Error("Nothing to save.");
    const text = input.text === undefined ? undefined : String(input.text).slice(0, MAX_TEXT);
    const sourceHash = hashText(String(input.source ?? ""));
    // Typing a translation moves it on from "draft"; clearing it moves it back.
    const status = input.status ?? (text?.trim() ? "translated" : "draft");
    const [row] = await userDb((tx) =>
      tx
        .insert(translation)
        .values({ projectId, unitKey: input.unitKey, locale: input.locale, text: text ?? "", status, sourceHash, updatedById: user.id })
        .onConflictDoUpdate({
          target: [translation.projectId, translation.unitKey, translation.locale],
          set: { ...(text !== undefined && { text }), status, sourceHash, updatedById: user.id, updatedAt: new Date() },
        })
        .returning({ unitKey: translation.unitKey, text: translation.text, status: translation.status, sourceHash: translation.sourceHash }),
    );
    return row;
  });
}

/**
 * Applies translations from a translator's file (CSV or XLIFF, already
 * parsed). `sources` gives the current source text of each key, so imported
 * rows are stamped with it; keys that aren't in the scope are skipped.
 */
export async function importTranslations(
  projectId: string,
  locale: string,
  rows: ImportedRow[],
  sources: Record<string, string>,
): Promise<{ imported: number; skipped: number }> {
  return transaction(async () => {
    const { user } = await requireSession();
    const { project } = await requireProjectAccess(projectId, "edit");
    assertLocale(project.settings, locale);
    if (!Array.isArray(rows)) throw new Error("That file couldn't be read.");
    if (rows.length > MAX_IMPORT) throw new Error(`That file has more than ${MAX_IMPORT.toLocaleString("en")} rows. Split it up.`);
    await rateLimit("translation-import", user.id, { limit: 60, windowSeconds: 3600 });
    const values = rows
      .filter((r) => typeof r?.key === "string" && UNIT_KEY.test(r.key) && Object.hasOwn(sources, r.key) && typeof r.target === "string" && r.target.trim() !== "")
      .map((r) => {
        const status = typeof r.status === "string" ? r.status.toLowerCase() : "";
        return {
          projectId,
          unitKey: r.key,
          locale,
          text: r.target.slice(0, MAX_TEXT),
          status: (translationStatuses as readonly string[]).includes(status) ? (status as TranslationStatus) : ("translated" as const),
          sourceHash: hashText(String(sources[r.key])),
          updatedById: user.id,
        };
      });
    // The last row wins when a file repeats a key.
    const unique = [...new Map(values.map((v) => [v.unitKey, v])).values()];
    for (let i = 0; i < unique.length; i += 500) {
      const batch = unique.slice(i, i + 500);
      await userDb((tx) =>
        tx
          .insert(translation)
          .values(batch)
          .onConflictDoUpdate({
            target: [translation.projectId, translation.unitKey, translation.locale],
            set: { text: sql`excluded.text`, status: sql`excluded.status`, sourceHash: sql`excluded.source_hash`, updatedById: user.id, updatedAt: new Date() },
          }),
      );
    }
    return { imported: unique.length, skipped: rows.length - unique.length };
  });
}

// ---- Glossary ---------------------------------------------------------------------

const termColumns = {
  id: glossaryTerm.id,
  term: glossaryTerm.term,
  locale: glossaryTerm.locale,
  translation: glossaryTerm.translation,
  rule: glossaryTerm.rule,
  note: glossaryTerm.note,
};

export async function listGlossary(projectId: string): Promise<Term[]> {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    return userDb((tx) => tx.select(termColumns).from(glossaryTerm).where(eq(glossaryTerm.projectId, projectId)).orderBy(asc(glossaryTerm.term)));
  });
}

type TermInput = { term?: string; locale?: string | null; translation?: string | null; rule?: GlossaryRule; note?: string | null };

function cleanTerm(input: TermInput, locales: string[] = []): Partial<typeof glossaryTerm.$inferInsert> {
  const values: Partial<typeof glossaryTerm.$inferInsert> = {};
  if (input.term !== undefined) {
    const term = input.term.trim().slice(0, 120);
    if (!term) throw new Error("Write the term.");
    values.term = term;
  }
  if (input.locale !== undefined) {
    if (input.locale && !locales.includes(input.locale)) throw new Error("Add that language in project settings first.");
    values.locale = input.locale || null;
  }
  if (input.translation !== undefined) values.translation = input.translation?.trim().slice(0, 200) || null;
  if (input.rule !== undefined) {
    if (!glossaryRules.includes(input.rule)) throw new Error("Unknown rule.");
    values.rule = input.rule;
  }
  if (input.note !== undefined) values.note = input.note?.trim().slice(0, 500) || null;
  return values;
}

export async function createTerm(projectId: string, input: TermInput & { term: string }): Promise<Term> {
  return transaction(async () => {
    const { project } = await requireProjectAccess(projectId, "edit");
    const values = cleanTerm(input, project.settings.locales);
    const [row] = await userDb((tx) =>
      tx
        .insert(glossaryTerm)
        .values({ projectId, ...values, term: values.term! })
        .returning(termColumns),
    );
    return row;
  });
}

export async function updateTerm(projectId: string, id: string, patch: TermInput): Promise<Term> {
  return transaction(async () => {
    const { project } = await requireProjectAccess(projectId, "edit");
    const values = cleanTerm(patch, project.settings.locales);
    const [row] = await userDb((tx) =>
      tx
        .update(glossaryTerm)
        .set(values)
        .where(and(eq(glossaryTerm.id, id), eq(glossaryTerm.projectId, projectId)))
        .returning(termColumns),
    );
    if (!row) throw new Error("That term no longer exists.");
    return row;
  });
}

export async function deleteTerm(projectId: string, id: string): Promise<void> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    await userDb((tx) => tx.delete(glossaryTerm).where(and(eq(glossaryTerm.id, id), eq(glossaryTerm.projectId, projectId))));
  });
}
