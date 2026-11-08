import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Choice } from "@/components/choice";
import { Icon } from "@/components/icon";
import { Button, Card, Chip, IconButton, Separator, T } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { invalidate, keys, useResource } from "@/lib/cache";
import {
  importFiles,
  importProjectFile,
  isMarkdown,
  isPlainText,
  kindOf,
  MAX_IMPORT_BYTES,
  previewImport,
  unsupportedMessage,
  type ImportOptions,
  type ImportPreview,
  type Picked,
} from "@/lib/io-api";
import { kindIcon } from "@/lib/kinds";
import { useClient } from "@/lib/session";
import { radius, space, useColors } from "@/lib/theme";
import { containers, pathOf } from "@/lib/tree";
import type { NodeKind } from "@/lib/types";

// Import (the web's Import… dialog, apps/app/components/io/import-dialog.tsx):
// Word, Markdown, rich text and plain-text files, or a Plottr file, become
// chapters, scenes and notes in a project; a Plotra project file (.plotra)
// becomes a new project of its own, in a workspace. The files are read on the
// server (/api/mobile/import), which says what they would create before
// anything is created. With `projectId` (and optionally `parentId`, a folder
// or chapter) the files go there; without, the person picks the project, or
// the workspace for a .plotra file.

const MB = 1024 * 1024;
const LISTED = 60;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function describe(summary: ImportPreview["summary"]) {
  const parts = [
    summary.folders && plural(summary.folders, "folder"),
    summary.chapters && plural(summary.chapters, "chapter"),
    summary.scenes && plural(summary.scenes, "scene"),
    summary.notes && plural(summary.notes, "note"),
  ].filter(Boolean);
  return `${parts.join(", ")} · ${plural(summary.words, "word")}`;
}

export default function ImportScreen() {
  const params = useLocalSearchParams<{ projectId?: string; parentId?: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const client = useClient();
  const projects = useResource(keys.projects, client.projects);
  const me = useResource(keys.me, client.me);

  const [files, setFiles] = useState<Picked[]>([]);
  const [projectFile, setProjectFile] = useState<Picked | null>(null);
  const [chosenProject, setChosenProject] = useState<string | null>(params.projectId ?? null);
  const [parentId, setParentId] = useState<string | null>(params.parentId ?? null);
  const [chosenWorkspace, setChosenWorkspace] = useState<string | null>(null);
  const [split, setSplit] = useState<ImportOptions["split"]>("headings");
  const [breaks, setBreaks] = useState(false);
  const [keepLines, setKeepLines] = useState(false);
  // Markdown notes are usually notes; a manuscript in Word or plain text is scenes.
  const [kind, setKind] = useState<ImportOptions["kind"] | null>(null);
  const [answer, setAnswer] = useState<{ key: string; preview?: ImportPreview; problem?: string; offline?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const projectId = params.projectId ?? chosenProject;
  const project = projects.data?.find((p) => p.id === projectId) ?? null;
  const notes = useResource(projectId ? keys.notes(projectId) : null, () => client.notes(projectId!));
  const places = useMemo(() => containers(notes.data ?? []).filter((n) => n.canEdit), [notes.data]);
  const parent = places.find((n) => n.id === parentId) ?? null;

  const workspaces = me.data?.workspaces ?? [];
  // A .plotra file goes to the workspace of the project it was opened from, to start with.
  const workspaceSlug = chosenWorkspace ?? project?.workspaceSlug ?? workspaces[0]?.slug ?? null;
  const workspace = workspaces.find((w) => w.slug === workspaceSlug) ?? null;

  const plottr = files.some((f) => kindOf(f.name) === "plottr");
  const hasMarkdown = files.some((f) => isMarkdown(f.name));
  const hasText = files.some((f) => isPlainText(f.name));
  const effectiveKind = kind ?? (files.length && files.every((f) => isMarkdown(f.name)) ? "note" : "scene");
  const options: ImportOptions = { split, breaks, kind: effectiveKind, lines: keepLines && hasMarkdown ? "keep" : "wrap" };
  // A Plottr file is sent without its pictures, so only the server can say whether it fits.
  const size = files.reduce((sum, f) => sum + f.size, 0);
  const tooLarge = !plottr && size > MAX_IMPORT_BYTES;

  // Ask the server what these files would create, a moment after the last change.
  const key = JSON.stringify([files.map((f) => [f.uri, f.size]), options, projectId, parent?.id ?? null]);
  useEffect(() => {
    if (!files.length || tooLarge || !projectId) return;
    let live = true;
    const timer = setTimeout(() => {
      previewImport(client, projectId, parent?.id ?? null, files, options)
        .then((preview) => live && setAnswer({ key, preview }))
        .catch((e) => live && setAnswer({ key, problem: (e as Error).message, offline: isOffline(e) }));
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // `key` stands for the files and every option.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tooLarge]);
  const preview = answer?.key === key ? (answer.preview ?? null) : null;
  const problem = answer?.key === key ? (answer.problem ?? null) : null;

  const choose = async () => {
    let result: DocumentPicker.DocumentPickerResult;
    try {
      // Any type: phones don't know Markdown, Plottr or Plotra files by type, so they're told apart by name here.
      result = await DocumentPicker.getDocumentAsync({ type: "*/*", multiple: true, copyToCacheDirectory: true });
    } catch {
      return Alert.alert("Couldn't open your files", "Try again.");
    }
    if (result.canceled || !result.assets.length) return;
    const chosen: Picked[] = result.assets.map((a) => ({ uri: a.uri, name: a.name, size: a.size ?? new File(a.uri).size }));
    // A Plotra project file is a project of its own, imported alone.
    const plotra = chosen.find((f) => kindOf(f.name) === "plotra");
    if (plotra) {
      setProjectFile(plotra);
      setFiles([]);
      return;
    }
    const unsupported = chosen.filter((f) => kindOf(f.name) === "unsupported");
    if (unsupported.length) Alert.alert("Some files can't be imported", unsupported.map((f) => unsupportedMessage(f.name)).join("\n\n"));
    // A Plottr file is a whole project from another app: it replaces whatever was chosen, and goes alone.
    const pltr = chosen.find((f) => kindOf(f.name) === "plottr");
    if (pltr) {
      setProjectFile(null);
      setFiles([pltr]);
      return;
    }
    const usable = chosen.filter((f) => kindOf(f.name) === "text");
    if (!usable.length) return;
    setProjectFile(null);
    setFiles((have) => [...have.filter((f) => kindOf(f.name) === "text"), ...usable.filter((f) => !have.some((h) => h.name === f.name && h.size === f.size))]);
  };

  const fail = (e: unknown) => {
    setBusy(false);
    if (isOffline(e)) Alert.alert("You're offline", "Importing needs a connection: the files are read on the server. Try again when you're back online.");
    else Alert.alert("The import didn't work", (e as Error).message);
  };

  const runProjectFile = async (file: Picked) => {
    if (!workspace) return;
    setBusy(true);
    try {
      const created = await importProjectFile(client, workspace.slug, file);
      invalidate(keys.projects);
      setBusy(false);
      Alert.alert("Imported", `“${file.name.replace(/\.plotra$/i, "")}” is a new project in ${workspace.name}${created.notes ? `, with ${plural(created.notes, "note")}` : ""}.`);
      router.replace({ pathname: "/project/[projectId]", params: { projectId: created.projectId } });
    } catch (e) {
      fail(e);
    }
  };

  const run = async () => {
    if (projectFile) return runProjectFile(projectFile);
    if (!projectId) return;
    setBusy(true);
    try {
      const created = await importFiles(client, projectId, parent?.id ?? null, files, options);
      invalidate(keys.notes(projectId));
      setBusy(false);
      Alert.alert("Imported", `${plural(created.notes, "note")}${parent ? ` into ${parent.title}` : project ? ` into ${project.title}` : ""}.`);
      // Opened from a project: back to its binder. Otherwise, to the project the files went into.
      if (params.projectId) router.back();
      else router.replace({ pathname: "/project/[projectId]", params: { projectId } });
    } catch (e) {
      fail(e);
    }
  };

  const ready = projectFile ? !!workspace : !!projectId && !!preview && !tooLarge;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Import",
          headerLeft: () => (
            <Pressable accessibilityRole="button" onPress={() => router.back()} disabled={busy} hitSlop={8}>
              <Text style={{ color: c.foreground, fontSize: 17, opacity: busy ? 0.4 : 1 }}>Cancel</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xxl }}>
        <View style={{ gap: 6 }}>
          <T tone="muted" style={{ fontSize: 15, lineHeight: 21 }}>
            {params.projectId
              ? `Bring writing in ${parent ? `to ${parent.title}` : "at the top of the binder"}. Nothing you already have is changed.`
              : "Bring writing into one of your projects, or a Plotra project file in as a new project. Nothing you already have is changed."}
          </T>
          <T tone="muted" style={{ fontSize: 14, lineHeight: 20 }}>
            {"• Word (.docx), Markdown, rich text (.rtf) or plain text files\n• A Plottr file (.pltr)\n• A Plotra project file (.plotra), which becomes a new project"}
          </T>
        </View>

        <Card style={{ padding: space.md, gap: space.sm }}>
          {projectFile && <FileRow file={projectFile} icon="archive" onRemove={() => setProjectFile(null)} />}
          {files.slice(0, LISTED).map((f) => (
            <FileRow key={`${f.uri}:${f.size}`} file={f} icon="document" onRemove={() => setFiles((have) => have.filter((h) => h !== f))} />
          ))}
          {files.length > LISTED && <T tone="muted" style={{ fontSize: 13 }}>{`and ${(files.length - LISTED).toLocaleString()} more`}</T>}
          {plottr && <T tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>A Plottr file: its timeline, cards and plotlines, characters, places and notes.</T>}
          <Button label={files.length ? "Add files…" : projectFile ? "Choose another file…" : "Choose files…"} icon="importFile" variant="secondary" disabled={busy} onPress={() => void choose()} />
          <T tone="muted" style={{ fontSize: 12, lineHeight: 17 }}>
            Up to 10 MB at a time. For a Scrivener project or a World Anvil export, import on the web.
          </T>
        </Card>

        {projectFile ? (
          workspaces.length > 1 && (
            <View style={{ gap: 6 }}>
              <Label>Workspace</Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }} accessibilityRole="radiogroup">
                {workspaces.map((w) => (
                  <Chip key={w.id} label={w.name} selected={w.slug === workspaceSlug} onPress={() => setChosenWorkspace(w.slug)} />
                ))}
              </View>
            </View>
          )
        ) : (
          <>
            {!params.projectId && files.length > 0 && (
              <View style={{ gap: 6 }}>
                <Label>Into which project?</Label>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }} accessibilityRole="radiogroup">
                  {(projects.data ?? []).map((p) => (
                    <Chip
                      key={p.id}
                      label={p.title}
                      selected={p.id === projectId}
                      onPress={() => {
                        setChosenProject(p.id);
                        setParentId(null);
                      }}
                    />
                  ))}
                </View>
              </View>
            )}
            {projectId && places.length > 0 && files.length > 0 && (
              <View style={{ gap: 6 }}>
                <Label>Where?</Label>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }} accessibilityRole="radiogroup">
                  <Chip label="At the top of the binder" selected={!parent} onPress={() => setParentId(null)} />
                  {places.map((p) => (
                    <Chip key={p.id} label={[...pathOf(notes.data ?? [], p.id), p.title].join(" › ")} selected={parent?.id === p.id} onPress={() => setParentId(p.id)} />
                  ))}
                </View>
              </View>
            )}
            {/* A Plottr file keeps its own structure: none of the ways of cutting up files apply. */}
            {files.length > 0 && !plottr && (
              <View style={{ gap: 6 }}>
                <Label>How to split the files</Label>
                <Card>
                  <Choice
                    title="Split at headings"
                    detail={`A top-level heading (#, Heading 1${hasText ? ", or a line like “Chapter 1”" : ""}) starts a chapter; a second-level heading (##, Heading 2) starts a scene.`}
                    selected={split === "headings"}
                    onPress={() => setSplit("headings")}
                  />
                  <Separator />
                  <Choice title="One note per file" detail="Each file becomes a single note, headings and all." selected={split === "file"} onPress={() => setSplit("file")} />
                  <Separator />
                  <Choice checkbox title="Start a new scene at every scene break" detail="A line of ***, # or a rule between passages." selected={breaks} onPress={() => setBreaks(!breaks)} />
                  {hasMarkdown && (
                    <>
                      <Separator />
                      <Choice
                        checkbox
                        title="Keep single line breaks"
                        detail="A new line in a Markdown note stays a new line, as Obsidian shows it. Leave off for text that was wrapped by hand."
                        selected={keepLines}
                        onPress={() => setKeepLines(!keepLines)}
                      />
                    </>
                  )}
                </Card>
                <Label>Text without a heading of its own becomes</Label>
                <View style={{ flexDirection: "row", gap: space.sm }} accessibilityRole="radiogroup">
                  <Chip label="A scene" selected={effectiveKind === "scene"} onPress={() => setKind("scene")} />
                  <Chip label="A note" selected={effectiveKind === "note"} onPress={() => setKind("note")} />
                </View>
              </View>
            )}
          </>
        )}

        <View accessibilityLiveRegion="polite" style={{ backgroundColor: c.muted, borderRadius: radius.md, padding: space.md, gap: space.xs, minHeight: 56 }}>
          {projectFile ? (
            workspace ? (
              <>
                <T style={{ fontWeight: "600" }}>{`Creates a new project in ${workspace.name} from “${projectFile.name}”.`}</T>
                <T tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>
                  Everything in the file comes along: notes, boards, timelines, version history, comments and pictures, and its world if it has one.
                </T>
              </>
            ) : (
              <T tone="muted">{me.offline || isOffline(me.error) ? "You're offline. Importing needs a connection." : "Only members of a workspace can add projects to it."}</T>
            )
          ) : tooLarge ? (
            <T tone="destructive">{`These files are ${Math.ceil(size / MB)} MB together; an import can be up to 10 MB. Import them in parts.`}</T>
          ) : !files.length ? (
            <T tone="muted">Choose files to see what will be created.</T>
          ) : !projectId ? (
            <T tone="muted">Choose the project to bring them into.</T>
          ) : problem ? (
            <T tone={answer?.offline ? "muted" : "destructive"}>{answer?.offline ? "You're offline. Importing needs a connection: the files are read on the server." : problem}</T>
          ) : !preview ? (
            <T tone="muted">Reading…</T>
          ) : (
            <>
              <T style={{ fontWeight: "600" }}>{`Creates ${describe(preview.summary)}`}</T>
              {(!!preview.threads || !!preview.properties) && (
                <T tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>
                  {[
                    preview.threads && `Its ${plural(preview.threads, "plotline")} become plot threads`,
                    preview.properties && `${plural(preview.properties, "extra detail")} from the top of Markdown files, kept as properties`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  .
                </T>
              )}
              <View style={{ gap: 2, marginTop: space.xs }}>
                {preview.entries.slice(0, LISTED).map((entry, i) => {
                  let depth = 0;
                  for (let p = entry.parent; p !== null && depth < 8; p = preview.entries[p]?.parent ?? null) depth++;
                  return (
                    <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: depth * 14 }}>
                      <Icon name={kindIcon[entry.kind as NodeKind] ?? "note"} size={14} color={c.mutedForeground} />
                      <Text numberOfLines={1} style={{ flex: 1, color: c.mutedForeground, fontSize: 13 }}>
                        {entry.title || "Untitled"}
                      </Text>
                    </View>
                  );
                })}
                {preview.entries.length > LISTED && <T tone="muted" style={{ fontSize: 13 }}>…</T>}
              </View>
            </>
          )}
        </View>

        <Button label={busy ? "Importing…" : "Import"} busy={busy} disabled={!ready} onPress={() => void run()} />
      </ScrollView>
    </>
  );
}

function FileRow({ file, icon, onRemove }: { file: Picked; icon: "archive" | "document"; onRemove: () => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <Icon name={icon} size={18} color={c.mutedForeground} />
      <Text numberOfLines={1} style={{ flex: 1, color: c.foreground, fontSize: 15 }}>
        {file.name}
      </Text>
      <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{`${Math.max(1, Math.round(file.size / 1024)).toLocaleString()} KB`}</Text>
      <IconButton name="close" label={`Remove ${file.name}`} onPress={onRemove} />
    </View>
  );
}

function Label({ children }: { children: string }) {
  const c = useColors();
  return <Text style={{ color: c.mutedForeground, fontSize: 13, fontWeight: "600" }}>{children}</Text>;
}
