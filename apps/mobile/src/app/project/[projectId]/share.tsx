import * as Clipboard from "expo-clipboard";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, Switch, Text, View } from "react-native";
import { Field } from "@/components/field";
import { Icon } from "@/components/icon";
import { useMenu } from "@/components/menu";
import { Avatar } from "@/components/person";
import { Banner, Button, Card, Chip, Empty, Loading, Row, SectionLabel, Separator, T } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { keys, useResource } from "@/lib/cache";
import { openWeb, webUrl } from "@/lib/links";
import { useProject } from "@/lib/project";
import { useClient } from "@/lib/session";
import {
  absolute,
  createLink,
  deleteLink,
  getSharing,
  projectRoles,
  removeShare,
  resetLink,
  roleMeta,
  setRole,
  settingsKeys,
  shareProject,
  updateLink,
  workspaceRoleLabel,
  type ProjectRole,
  type SharedWith,
  type ShareLink,
} from "@/lib/settings-api";
import { radius, space, useColors } from "@/lib/theme";

// Who can open the project, as the web's Share dialog has it
// (apps/app/components/workspace/share-dialog.tsx): add anyone by email with a
// role, change or take it away, see the workspace's members, and the
// read-only links that open without an account. For people who manage the
// project (workspace owners and admins); the server checks.

const firstName = (p: { name: string | null; email: string }) => p.name?.split(" ")[0] || p.email;

export default function ShareScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const c = useColors();
  const client = useClient();
  const menu = useMenu();
  const { project } = useProject(projectId);
  const data = useResource(settingsKeys.sharing(projectId), () => getSharing(client, projectId));
  const releases = useResource(keys.releases(projectId), () => client.releases(projectId));
  const [email, setEmail] = useState("");
  const [role, setRoleChoice] = useState<ProjectRole>("commenter");
  const [busy, setBusy] = useState(false);

  /** Does a change, says how it went, and loads the list again. */
  const run = async (work: () => Promise<string | void>, failTitle = "That didn't work") => {
    setBusy(true);
    try {
      const message = await work();
      await data.refresh();
      if (message) Alert.alert(message);
    } catch (e) {
      Alert.alert(failTitle, (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const address = email.trim();
    if (!address) return;
    void run(async () => {
      const { pending } = await shareProject(client, projectId, address, role);
      setEmail("");
      return pending ? `Invitation sent to ${address}.` : `Shared with ${address}.`;
    }, "Couldn't share");
  };

  const remove = (person: SharedWith) =>
    run(async () => {
      await removeShare(client, projectId, person.id);
      await data.refresh();
      // As on the web: sharing again with the same role undoes it (they get the invitation email again).
      Alert.alert(`Removed ${firstName(person)}`, `They can no longer open “${project?.title ?? "this project"}”.`, [
        { text: "OK", style: "cancel" },
        {
          text: "Undo",
          onPress: () =>
            void run(async () => {
              await shareProject(client, projectId, person.email, person.role);
              return `${firstName(person)} is back, and ${roleMeta[person.role].sentence}.`;
            }),
        },
      ]);
    });

  const personMenu = (person: SharedWith) =>
    menu({
      title: person.name ?? person.email,
      message: `${roleMeta[person.role].label}: ${roleMeta[person.role].description}`,
      items: [
        ...projectRoles
          .filter((r) => r !== person.role)
          .map((r) => ({
            label: `Make ${roleMeta[r].label.toLowerCase()}: ${roleMeta[r].description.toLowerCase().replace(/\.$/, "")}`,
            icon: "person" as const,
            onPress: () =>
              void run(async () => {
                await setRole(client, projectId, person.id, r);
                return `${firstName(person)} ${roleMeta[r].sentence}.`;
              }),
          })),
        { label: "Remove from this project", icon: "close" as const, destructive: true, onPress: () => void remove(person) },
      ],
    });

  const notAllowed = data.error instanceof ApiError && (data.error.status === 403 || data.error.status === 404);

  return (
    <>
      <Stack.Screen options={{ title: project ? `Share “${project.title}”` : "Share" }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background }}>
        <ScrollView contentContainerStyle={{ paddingBottom: space.xxl * 2 }} keyboardShouldPersistTaps="handled">
          <Banner offline={data.offline} error={data.offline || notAllowed ? null : data.error} onRetry={data.refresh} />
          {notAllowed && !data.data ? (
            <Empty
              icon="lock"
              title="Only managers can share"
              body="The workspace's owners and admins decide who can open this project. Ask one of them to share it."
            />
          ) : !data.data ? (
            <Loading />
          ) : (
            <>
              <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md }}>
                <T tone="muted" style={{ fontSize: 14, lineHeight: 20 }}>
                  Add anyone by email, in or outside the workspace. They see only this project.
                </T>
                <Field
                  label="Email address"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="name@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  returnKeyType="send"
                  onSubmitEditing={submit}
                />
                <View style={{ gap: 6 }}>
                  <Text style={{ color: c.mutedForeground, fontSize: 13, fontWeight: "600" }}>What they can do</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                    {projectRoles.map((r) => (
                      <Chip key={r} label={roleMeta[r].label} selected={role === r} onPress={() => setRoleChoice(r)} />
                    ))}
                  </View>
                  <T tone="muted" style={{ fontSize: 13 }}>
                    {roleMeta[role].description}
                  </T>
                </View>
                <Button label="Share" icon="addPerson" busy={busy} disabled={!email.trim() || data.offline} onPress={submit} />
              </View>

              {data.data.sharing.shared.length > 0 && (
                <>
                  <SectionLabel>Shared with</SectionLabel>
                  <Card style={{ marginHorizontal: space.lg }}>
                    {data.data.sharing.shared.map((person, i) => (
                      <View key={person.id}>
                        {i > 0 && <Separator inset={64} />}
                        <PersonRow
                          name={person.name ?? person.email}
                          image={person.image}
                          detail={person.pending ? "Invited: hasn't opened the link yet" : person.isMember ? `${person.email} · also a workspace member` : person.email}
                          right={roleMeta[person.role].label}
                          onPress={busy ? undefined : () => personMenu(person)}
                          hint="Change what they can do, or remove them"
                        />
                      </View>
                    ))}
                  </Card>
                </>
              )}

              <SectionLabel>
                {data.data.sharing.workspace.name} · {data.data.sharing.members.length} {data.data.sharing.members.length === 1 ? "member" : "members"}
              </SectionLabel>
              <Card style={{ marginHorizontal: space.lg }}>
                {data.data.sharing.members.map((m, i) => (
                  <View key={m.userId}>
                    {i > 0 && <Separator inset={64} />}
                    <PersonRow name={m.name} image={m.image} detail={m.email} right={workspaceRoleLabel[m.role]} />
                  </View>
                ))}
                <Separator inset={52} />
                <Row
                  icon="people"
                  title="Workspace members and invitations"
                  onPress={() => router.push({ pathname: "/settings/members", params: { workspace: data.data!.sharing.workspace.slug, name: data.data!.sharing.workspace.name } })}
                  right={<Icon name="chevronRight" size={14} color={c.mutedForeground} />}
                />
              </Card>
              <T tone="muted" style={{ marginHorizontal: space.lg, marginTop: space.sm, fontSize: 13, lineHeight: 18 }}>
                Workspace members can open and edit every project. Owners and admins also manage sharing and settings.
              </T>

              <Links
                projectId={projectId}
                links={data.data.links}
                releases={releases.data ?? []}
                onChanged={data.refresh}
                webHref={project ? webUrl(client.server, project) : client.server}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function PersonRow({ name, image, detail, right, onPress, hint }: { name: string; image: string | null; detail: string; right: string; onPress?: () => void; hint?: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${name}, ${right}`}
      accessibilityHint={onPress ? hint : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 56, backgroundColor: pressed ? c.accent : "transparent" })}
    >
      <Avatar name={name} image={image} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: c.foreground, fontSize: 16 }}>
          {name}
        </Text>
        <Text numberOfLines={1} style={{ color: c.mutedForeground, fontSize: 13, marginTop: 2 }}>
          {detail}
        </Text>
      </View>
      <Text style={{ color: onPress ? c.foreground : c.mutedForeground, fontSize: 14 }}>{right}</Text>
      {onPress && <Icon name="chevronDown" size={12} color={c.mutedForeground} />}
    </Pressable>
  );
}

/** The read-only links (apps/app/components/public/share-link-section.tsx): on or off, copy, how far readers see, a new address. */
function Links({ projectId, links, releases, onChanged, webHref }: { projectId: string; links: ShareLink[]; releases: { id: string; title: string }[]; onChanged: () => Promise<void>; webHref: string }) {
  const c = useColors();
  const client = useClient();
  const menu = useMenu();
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<unknown>, message?: string) => {
    setBusy(true);
    try {
      await work();
      await onChanged();
      if (message) Alert.alert(message);
    } catch (e) {
      Alert.alert("That didn't work", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmReset = (link: ShareLink) =>
    Alert.alert("Make a new link?", "The old link stops working at once, for everyone who has it. You'll need to send the new one to the people you want to keep reading.", [
      { text: "Cancel", style: "cancel" },
      { text: "Make a new link", onPress: () => void run(() => resetLink(client, projectId, link.id), "New link made. The old one no longer works.") },
    ]);

  const confirmDelete = (link: ShareLink) =>
    Alert.alert(`Remove ${link.name ? `‘${link.name}’` : "this link"}?`, "It stops working at once, for good, for everyone who has it. Its settings go too.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove link", style: "destructive", onPress: () => void run(() => deleteLink(client, projectId, link.id), "Link removed.") },
    ]);

  const pickHorizon = (link: ShareLink) =>
    releases.length
      ? menu({
          title: "How far readers can see",
          items: [
            { label: "Everything, spoilers included", onPress: () => void run(() => updateLink(client, projectId, link.id, { horizonReleaseId: null })) },
            ...releases.map((r) => ({ label: `Up to ${r.title}`, onPress: () => void run(() => updateLink(client, projectId, link.id, { horizonReleaseId: r.id })) })),
          ],
        })
      : Alert.alert(
          "No releases yet",
          "To hide spoilers, add releases in the Release roadmap on the web (a book, an episode, a game session), then pick one here: readers see only what's been revealed by then.",
        );

  return (
    <>
      <SectionLabel>Anyone with the link</SectionLabel>
      {links.length === 0 ? (
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          <T tone="muted" style={{ fontSize: 14, lineHeight: 20 }}>
            No link yet. Make one that opens without an account: for everything in the project, or for an audience as of a release, so players or readers see only what they know.
          </T>
          <Button label="Make a link" icon="link" variant="secondary" busy={busy} onPress={() => void run(() => createLink(client, projectId))} />
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          {links.map((link) => {
            const url = absolute(client.server, link.path);
            const asOf = releases.find((r) => r.id === link.horizonReleaseId);
            const limited = Boolean(link.horizonReleaseId) || link.canonOnly;
            return (
              <Card key={link.id} style={{ marginHorizontal: space.lg }}>
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md }}>
                  <Text style={{ flex: 1, color: c.foreground, fontSize: 16, fontWeight: "600" }}>{link.name || (link.enabled ? "On" : "Off")}</Text>
                  <Switch
                    value={link.enabled}
                    disabled={busy}
                    accessibilityLabel={link.enabled ? "Switch the link off" : "Switch the link on"}
                    onValueChange={(enabled) => void run(() => updateLink(client, projectId, link.id, { enabled }), enabled ? undefined : "The link is off.")}
                  />
                </View>
                <View style={{ padding: space.lg, gap: space.md }}>
                  {link.enabled ? (
                    <>
                      <View style={{ flexDirection: "row", gap: space.sm }}>
                        <Icon name={limited ? "lock" : "info"} size={16} color={limited ? c.teal : c.emberInk} />
                        <T style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
                          {limited
                            ? `Anyone with the link can read the project without an account, ${[asOf ? `only as far as ${asOf.title}` : "", link.canonOnly ? "only what's canon" : ""].filter(Boolean).join(" and ")}. Anything revealed later, and anything you marked to never show, stays hidden.`
                            : "Anyone with the link can read everything in this project, spoilers included, without an account. They can't edit or comment."}
                        </T>
                      </View>
                      <Text selectable numberOfLines={2} style={{ color: c.mutedForeground, fontSize: 13, fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), padding: space.sm, borderRadius: radius.sm, backgroundColor: c.muted }}>
                        {url}
                      </Text>
                      <View style={{ flexDirection: "row", gap: space.sm }}>
                        <Button
                          label="Copy"
                          icon="copy"
                          variant="secondary"
                          style={{ flex: 1, height: 44 }}
                          onPress={() =>
                            void Clipboard.setStringAsync(url).then(
                              () => Alert.alert("Link copied."),
                              () => Alert.alert("Couldn't copy", "Press and hold the link to copy it."),
                            )
                          }
                        />
                        <Button label="Send" icon="share" variant="secondary" style={{ flex: 1, height: 44 }} onPress={() => void Share.share({ message: url, url })} />
                      </View>
                    </>
                  ) : (
                    <T tone="muted" style={{ fontSize: 13 }}>
                      Off: the link doesn&apos;t open. Switch it back on and the same link works again.
                    </T>
                  )}
                </View>
                <Separator inset={0} />
                <Row icon="eye" title="How far readers can see" subtitle={asOf ? `Up to ${asOf.title}: nothing revealed after it` : "Everything, spoilers included"} onPress={busy ? undefined : () => pickHorizon(link)} />
                <Separator inset={52} />
                <Row icon="newLink" title="Make a new link" subtitle="The old one stops working" onPress={busy ? undefined : () => confirmReset(link)} />
                <Separator inset={52} />
                <Row icon="trash" iconColor={c.destructive} title="Remove link" onPress={busy ? undefined : () => confirmDelete(link)} />
              </Card>
            );
          })}
          <Card style={{ marginHorizontal: space.lg }}>
            {links.length < 5 && (
              <>
                <Row icon="add" title="Add another link" subtitle="For another audience: players, patrons" onPress={busy ? undefined : () => void run(() => createLink(client, projectId, `Link ${links.length + 1}`))} />
                <Separator inset={52} />
              </>
            )}
            <Row
              icon="web"
              title="More on the web"
              subtitle="Naming links, canon only, the public gallery and letting readers copy"
              onPress={() => void openWeb(webHref)}
              right={<Icon name="chevronRight" size={14} color={c.mutedForeground} />}
            />
          </Card>
        </View>
      )}
    </>
  );
}
