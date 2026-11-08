import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState, type ReactNode } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { Field, splitTags } from "@/components/field";
import { Icon } from "@/components/icon";
import { NotePicker } from "@/components/note-picker";
import { Chip, Loading } from "@/components/ui";
import { isOffline } from "@/lib/api";
import {
  binderKeys,
  canonMeta,
  canonStatuses,
  layerMeta,
  noteDetails,
  updateDetails,
  type CanonStatus,
  type DetailsPatch,
  type Field as FieldDef,
  type FieldValue,
  type Layer,
  type NoteDetails,
} from "@/lib/binder-api";
import { invalidate, keys, useResource } from "@/lib/cache";
import { defaultStatuses, kindLabel, statusLabel } from "@/lib/kinds";
import { useOutbox } from "@/lib/outbox";
import { useProject } from "@/lib/project";
import { useClient } from "@/lib/session";
import { radius, space, useColors } from "@/lib/theme";
import type { Note, NotePatch, Release } from "@/lib/types";

// A note's details: title, synopsis, tags, other names and status (these
// wait on the phone when offline), and, from the server, its custom fields,
// canon status, when the audience learns it, its label and its world page
// type. Those need a connection: they go through the web's own actions.

export default function DetailsScreen() {
  const { projectId, noteId } = useLocalSearchParams<{ projectId: string; noteId: string }>();
  const c = useColors();
  const { notes } = useProject(projectId);
  const note = notes.data?.find((n) => n.id === noteId);
  if (!note)
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <Stack.Screen options={{ title: "Details" }} />
        <Loading />
      </View>
    );
  return <DetailsForm key={note.id} projectId={projectId} note={note} />;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function DetailsForm({ projectId, note }: { projectId: string; note: Note }) {
  const noteId = note.id;
  const c = useColors();
  const client = useClient();
  const { enqueue } = useOutbox();
  const { notes } = useProject(projectId);
  const details = useResource(binderKeys.details(projectId, noteId), () => noteDetails(client, projectId, noteId));
  const releases = useResource(keys.releases(projectId), () => client.releases(projectId));
  const [title, setTitle] = useState(note.title);
  const [synopsis, setSynopsis] = useState(note.synopsis ?? "");
  const [tags, setTags] = useState(note.tags.join(", "));
  const [aliases, setAliases] = useState(note.aliases.join(", "));
  const [status, setStatus] = useState<string | null>(note.status);
  // What's been changed in the server-only parts, on top of what came back.
  const [extra, setExtra] = useState<DetailsPatch>({});
  const [saving, setSaving] = useState(false);

  const d = details.data;
  const stages = d?.stages.length ? d.stages.map((s) => ({ id: s.id, label: s.label })) : defaultStatuses.map((s) => ({ id: s as string, label: statusLabel(s) ?? s }));
  if (note.status && !stages.some((s) => s.id === note.status)) stages.push({ id: note.status, label: statusLabel(note.status) ?? note.status });

  const value = (key: string): FieldValue => (extra.properties && key in extra.properties ? extra.properties[key] : (d?.values[key] ?? null));
  const setValue = (key: string, next: FieldValue) => setExtra((e) => ({ ...e, properties: { ...e.properties, [key]: next } }));
  const canon = extra.canon ?? d?.canon ?? null;
  const reveal = { ...d?.reveal, ...extra.reveal };
  const label = extra.label !== undefined ? extra.label : (d?.label ?? null);
  const entityTypeId = extra.entityTypeId ?? d?.entityTypeId ?? null;

  /** Only what actually changed goes to the server. */
  const extraPatch = (): DetailsPatch | null => {
    if (!d) return null;
    const patch: DetailsPatch = {};
    const props = Object.fromEntries(Object.entries(extra.properties ?? {}).filter(([k, v]) => !same(v, d.values[k])));
    if (Object.keys(props).length) patch.properties = props;
    if (extra.canon && extra.canon !== d.canon) Object.assign(patch, { canon: extra.canon, canonReason: extra.canonReason, canonReleaseId: extra.canonReleaseId });
    if (extra.reveal && d.reveal) {
      const r = Object.fromEntries(Object.entries(extra.reveal).filter(([k, v]) => !same(v, d.reveal![k as keyof typeof d.reveal])));
      if (Object.keys(r).length) patch.reveal = r;
    }
    if (extra.label !== undefined && extra.label !== d.label) patch.label = extra.label;
    if (extra.entityTypeId && extra.entityTypeId !== d.entityTypeId) patch.entityTypeId = extra.entityTypeId;
    return Object.keys(patch).length ? patch : null;
  };

  const save = async () => {
    const patch: NotePatch = {};
    if (title.trim() && title.trim() !== note.title) patch.title = title.trim();
    if (synopsis.trim() !== (note.synopsis ?? "")) patch.synopsis = synopsis.trim() || null;
    const nextTags = splitTags(tags);
    if (nextTags.join("\n") !== note.tags.join("\n")) patch.tags = nextTags;
    const nextAliases = splitList(aliases);
    if (nextAliases.join("\n") !== note.aliases.join("\n")) patch.aliases = nextAliases;
    if (status && status !== note.status) patch.status = status;
    const more = extraPatch();
    if (more?.canon === "retconned" && !more.canonReason?.trim()) return Alert.alert("Say what changed", "A retcon needs a reason, so its history makes sense later.");
    if (!Object.keys(patch).length && !more) return router.back();
    setSaving(true);
    let queued = false;
    try {
      if (Object.keys(patch).length) {
        try {
          const updated = await client.updateNote(projectId, noteId, patch);
          notes.mutate((list) => list?.map((n) => (n.id === noteId ? updated : n)));
        } catch (e) {
          if (!isOffline(e)) throw e;
          // Offline: the plain details wait on the phone, as before.
          enqueue({ type: "patch", projectId, noteId, title: patch.title ?? note.title, patch });
          notes.mutate((list) => list?.map((n) => (n.id === noteId ? { ...n, ...patch, synopsis: patch.synopsis !== undefined ? patch.synopsis : n.synopsis } : n)));
          queued = true;
        }
      }
      if (more) {
        if (queued) throw new OfflineFields();
        const fresh = await updateDetails(client, projectId, noteId, more);
        details.mutate(() => fresh);
        notes.mutate((list) => list?.map((n) => (n.id === noteId ? { ...fresh.note } : n)));
      }
      invalidate(keys.note(projectId, noteId));
      invalidate(keys.notes(projectId));
      router.back();
    } catch (e) {
      setSaving(false);
      if (e instanceof OfflineFields || isOffline(e))
        Alert.alert(
          "Fields need a connection",
          queued ? "The title, synopsis, tags and status are saved on your phone and go when you're back online. Fields, canon, reveal and label need you online." : "You're offline. Fields, canon, reveal and label can be changed when you're back online.",
          queued ? [{ text: "OK", onPress: () => router.back() }] : undefined,
        );
      else Alert.alert("Couldn't save", (e as Error).message);
    }
  };

  const releaseList = releases.data ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          title: `${kindLabel[note.kind]} details`,
          headerLeft: () => (
            <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
              <Text style={{ color: c.foreground, fontSize: 17 }}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable accessibilityRole="button" onPress={save} disabled={saving} hitSlop={8} style={{ opacity: saving ? 0.4 : 1 }}>
              <Text style={{ color: c.emberInk, fontSize: 17, fontWeight: "600" }}>{saving ? "Saving…" : "Save"}</Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background }}>
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl }} keyboardShouldPersistTaps="handled">
          <Field label="Title" value={title} onChangeText={setTitle} returnKeyType="done" />
          <Field label="Synopsis" value={synopsis} onChangeText={setSynopsis} multiline placeholder="What happens here, in a line or two" />
          <Field label="Tags" value={tags} onChangeText={setTags} autoCapitalize="none" placeholder="flashback, act-two" hint="Separate tags with commas." />
          <Field label="Other names" value={aliases} onChangeText={setAliases} placeholder="Jules, the Captain" hint="For links and mentions. Separate them with commas." />
          <Section label="Status">
            <Chips>
              {stages.map((s) => (
                <Chip key={s.id} label={s.label} selected={status === s.id} onPress={() => setStatus(s.id)} />
              ))}
            </Chips>
          </Section>

          {!d && details.loading && <Loading />}
          {!d && !details.loading && (
            <Text style={{ color: c.mutedForeground, fontSize: 14, lineHeight: 20 }}>
              {details.offline ? "You're offline. Fields, canon and reveals show when you're back online." : (details.error?.message ?? "")}
            </Text>
          )}

          {d && d.entityTypes.length > 0 && (
            <Section label="Type of world page">
              <Chips>
                {d.entityTypes.map((t) => (
                  <Chip key={t.id} label={t.name} selected={entityTypeId === t.id} onPress={() => setExtra((e) => ({ ...e, entityTypeId: t.id, properties: undefined }))} />
                ))}
              </Chips>
              {extra.entityTypeId && extra.entityTypeId !== d.entityTypeId && <Hint>Its fields change to the new type’s when you save.</Hint>}
            </Section>
          )}

          {d && d.labels.length > 0 && (
            <Section label="Label">
              <Chips>
                <Chip label="None" selected={!label} onPress={() => setExtra((e) => ({ ...e, label: null }))} />
                {d.labels.map((l) => (
                  <ColorChip key={l.id} label={l.name} color={l.color} selected={label === l.id} onPress={() => setExtra((e) => ({ ...e, label: l.id }))} />
                ))}
              </Chips>
            </Section>
          )}

          {d && !(extra.entityTypeId && extra.entityTypeId !== d.entityTypeId) && d.fields.length > 0 && (
            <View style={{ gap: space.lg }}>
              <Heading>Fields</Heading>
              {d.fields.map((f) => (
                <FieldEditor key={f.key} def={f} value={value(f.key)} onChange={(v) => setValue(f.key, v)} notes={notes.data ?? []} exclude={noteId} />
              ))}
            </View>
          )}

          {d && canon && (
            <Section label="Canon">
              <Chips>
                {canonStatuses.map((s) => (
                  <ColorChip key={s} label={canonMeta[s].label} color={canonMeta[s].color} selected={canon === s} onPress={() => setExtra((e) => ({ ...e, canon: s as CanonStatus }))} />
                ))}
              </Chips>
              <Hint>{canonMeta[canon].description}</Hint>
              {canon === "retconned" && d.canon !== "retconned" && (
                <View style={{ gap: space.md }}>
                  <Field
                    label="What changed, and why?"
                    value={extra.canonReason ?? ""}
                    onChangeText={(t) => setExtra((e) => ({ ...e, canonReason: t }))}
                    multiline
                    placeholder="e.g. “Her brother survives: Book 3 needs him.”"
                    hint="The text as it stands now is kept as a version, so the old canon can always be read."
                  />
                  {releaseList.length > 0 && (
                    <Section label="Changed in (optional)">
                      <Chips>
                        <Chip label="Not saying" selected={!extra.canonReleaseId} onPress={() => setExtra((e) => ({ ...e, canonReleaseId: null }))} />
                        {releaseList.map((r) => (
                          <Chip key={r.id} label={r.title} selected={extra.canonReleaseId === r.id} onPress={() => setExtra((e) => ({ ...e, canonReleaseId: r.id }))} />
                        ))}
                      </Chips>
                    </Section>
                  )}
                </View>
              )}
            </Section>
          )}

          {d?.reveal && <Reveal reveal={{ ...d.reveal, ...reveal }} releases={releaseList} onChange={(r) => setExtra((e) => ({ ...e, reveal: { ...e.reveal, ...r } }))} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

class OfflineFields extends Error {}

const splitList = (input: string) => [...new Set(input.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 50);

function Reveal({ reveal, releases, onChange }: { reveal: NonNullable<NoteDetails["reveal"]>; releases: Release[]; onChange: (r: NonNullable<DetailsPatch["reveal"]>) => void }) {
  const tagged = reveal.releaseId ?? null;
  return (
    <Section label="Revealed to the audience">
      {releases.length === 0 ? (
        <Hint>Add releases (books, episodes, sessions) on the web to say what each one reveals.</Hint>
      ) : (
        <Chips>
          <Chip label={reveal.inheritedFrom ? `With its folder (${reveal.inheritedFrom.title})` : "Not revealed yet"} selected={!tagged} onPress={() => onChange({ releaseId: null })} />
          {releases.map((r) => (
            <Chip key={r.id} label={r.title} selected={tagged === r.id} onPress={() => onChange({ releaseId: r.id })} />
          ))}
        </Chips>
      )}
      {(tagged || reveal.inheritedFrom) && reveal.channels.length > 0 && (
        <Section label="Where">
          <Chips>
            <Chip label="Anywhere" selected={!reveal.channel} onPress={() => onChange({ channel: null })} />
            {reveal.channels.map((ch) => (
              <Chip key={ch} label={ch} selected={reveal.channel === ch} onPress={() => onChange({ channel: ch })} />
            ))}
          </Chips>
        </Section>
      )}
      <Section label="It's the">
        <Chips>
          {(["truth", "belief"] as Layer[]).map((l) => (
            <Chip key={l} label={layerMeta[l].label} selected={reveal.layer === l} onPress={() => onChange({ layer: l })} />
          ))}
        </Chips>
        <Hint>{layerMeta[reveal.layer].description}</Hint>
      </Section>
    </Section>
  );
}

/** One custom field, edited the way its type wants. */
function FieldEditor({ def, value, onChange, notes, exclude }: { def: FieldDef; value: FieldValue; onChange: (v: FieldValue) => void; notes: Note[]; exclude: string }) {
  const c = useColors();
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState("");
  const empty = value === null || value === "" || (Array.isArray(value) && value.length === 0);
  const clear = !empty && def.type !== "checkbox" ? (
    <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${def.label}`} onPress={() => onChange(null)} hitSlop={8}>
      <Text style={{ color: c.mutedForeground, fontSize: 13 }}>Clear</Text>
    </Pressable>
  ) : null;
  const box = { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, color: c.foreground, paddingHorizontal: space.md, paddingVertical: space.md, fontSize: 16 } as const;

  let body: ReactNode;
  switch (def.type) {
    case "checkbox":
      body = (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: c.foreground, fontSize: 16 }}>{value ? "Yes" : "No"}</Text>
          <Switch accessibilityLabel={def.label} value={!!value} onValueChange={(on) => onChange(on || null)} />
        </View>
      );
      break;
    case "select":
      body = (
        <Chips>
          {(def.choices ?? []).map((choice) => (
            <Chip key={choice} label={choice} selected={value === choice} onPress={() => onChange(value === choice ? null : choice)} />
          ))}
          {typeof value === "string" && !(def.choices ?? []).includes(value) && <Chip label={value} selected />}
          {!def.choices?.length && <Hint>This field has no choices yet. Add them on the web.</Hint>}
        </Chips>
      );
      break;
    case "multi_select": {
      const values = Array.isArray(value) ? value.map(String) : [];
      const all = [...new Set([...(def.choices ?? []), ...values])];
      const toggle = (v: string) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
      body = (
        <View style={{ gap: space.sm }}>
          {all.length > 0 && (
            <Chips>
              {all.map((choice) => (
                <Chip key={choice} label={choice} selected={values.includes(choice)} onPress={() => toggle(choice)} />
              ))}
            </Chips>
          )}
          <TextInput
            value={adding}
            onChangeText={setAdding}
            placeholder="Add another"
            placeholderTextColor={c.mutedForeground}
            accessibilityLabel={`Add to ${def.label}`}
            returnKeyType="done"
            onSubmitEditing={() => {
              const v = adding.trim();
              if (v && !values.includes(v)) onChange([...values, v]);
              setAdding("");
            }}
            style={box}
          />
        </View>
      );
      break;
    }
    case "node": {
      const ids = Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
      const byId = new Map(notes.map((n) => [n.id, n]));
      const linked = ids.filter((id) => byId.has(id));
      const choices = def.nodeKinds?.length ? notes.filter((n) => def.nodeKinds!.includes(n.kind)) : notes;
      body = (
        <View style={{ gap: space.sm }}>
          <Chips>
            {linked.map((id) => (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${byId.get(id)!.title || "Untitled"}`}
                onPress={() => onChange(def.multiple ? ids.filter((x) => x !== id) : null)}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: c.emberSoft }}
              >
                <Text style={{ color: c.emberInk, fontSize: 14 }}>{byId.get(id)!.title || "Untitled"}</Text>
                <Icon name="close" size={12} color={c.emberInk} />
              </Pressable>
            ))}
            {(def.multiple || linked.length === 0) && <Chip label={linked.length ? "Link another" : "Link a note"} onPress={() => setPicking(true)} />}
          </Chips>
          <NotePicker
            visible={picking}
            notes={choices}
            exclude={exclude}
            onPick={(n) => {
              setPicking(false);
              if (n && !ids.includes(n.id)) onChange(def.multiple ? [...linked, n.id] : n.id);
            }}
          />
        </View>
      );
      break;
    }
    case "number":
      body = (
        <TextInput
          value={value === null ? "" : String(value)}
          onChangeText={(t) => onChange(t.trim() === "" ? null : t.replace(",", "."))}
          keyboardType="decimal-pad"
          placeholder="Empty"
          placeholderTextColor={c.mutedForeground}
          accessibilityLabel={def.label}
          style={box}
        />
      );
      break;
    case "date":
      body = (
        <TextInput
          value={typeof value === "string" ? value : ""}
          onChangeText={(t) => onChange(t.trim() || null)}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={c.mutedForeground}
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
          accessibilityLabel={`${def.label}, a date like 2026-03-14`}
          style={box}
        />
      );
      break;
    default:
      body = (
        <TextInput
          value={typeof value === "string" ? value : value === null ? "" : String(value)}
          onChangeText={(t) => onChange(t === "" ? null : t)}
          placeholder={def.type === "url" ? "https://…" : "Empty"}
          placeholderTextColor={c.mutedForeground}
          keyboardType={def.type === "url" ? "url" : "default"}
          autoCapitalize={def.type === "url" ? "none" : "sentences"}
          multiline={def.type === "text"}
          accessibilityLabel={def.label}
          style={box}
        />
      );
  }
  return (
    <Section label={def.label} right={clear}>
      {body}
    </Section>
  );
}

function Section({ label, right, children }: { label: string; right?: ReactNode; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: c.mutedForeground, fontSize: 13, fontWeight: "600" }}>{label}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

const Chips = ({ children }: { children: ReactNode }) => <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>{children}</View>;

function Heading({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={{ color: c.foreground, fontSize: 17, fontWeight: "600" }}>{children}</Text>;
}

function Hint({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={{ color: c.mutedForeground, fontSize: 12, lineHeight: 17 }}>{children}</Text>;
}

/** A choice with its colour beside it: labels and canon statuses. */
function ColorChip({ label, color, selected, onPress }: { label: string; color: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.md, height: 34, borderRadius: radius.pill, backgroundColor: selected ? c.foreground : c.accent, opacity: pressed ? 0.7 : 1 })}
    >
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
      <Text numberOfLines={1} style={{ color: selected ? c.background : c.foreground, fontSize: 14 }}>
        {label}
      </Text>
    </Pressable>
  );
}
